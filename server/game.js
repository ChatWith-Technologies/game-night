import { randomInt, randomBytes } from "node:crypto";
import { trivia, categories, defaultCategories } from "./content.js";
import { partyAwards, partyPolls } from "./party-content.js";
import { truthQuestions } from "./truth-content.js";

export const MAX_PLAYERS = 8;
export const MODES = ["mix", "trivia", "party", "truefalse"];
const EMPTY_ROOM_LIFETIME = 10 * 60 * 1000;
const INACTIVE_ROOM_LIFETIME = 6 * 60 * 60 * 1000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const token = () => randomBytes(24).toString("hex");
export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function fail(message) {
  throw new Error(message);
}
const cleanCode = (code) =>
  String(code || "")
    .trim()
    .toUpperCase();

export function createGameEngine({ now = Date.now, onChange = () => {} } = {}) {
  const maxPlayers = MAX_PLAYERS;
  const rooms = new Map();
  function getRoom(code) {
    return (
      rooms.get(cleanCode(code)) ||
      fail(
        "That room is closed or does not exist. Check the code or create a new room.",
      )
    );
  }
  function changed(room) {
    room.updatedAt = now();
    onChange(room);
  }
  function host(room, hostToken) {
    if (typeof hostToken !== "string" || room.hostToken !== hostToken)
      fail("Only the host can do that.");
  }
  function player(room, playerToken) {
    return (
      [...room.players.values()].find((p) => p.token === playerToken) ||
      fail("Please join this room again.")
    );
  }
  function closeRoom(room, message) {
    rooms.delete(room.code);
    onChange({ code: room.code, expired: true, message });
  }
  function pruneRooms() {
    for (const room of rooms.values()) {
      if (
        (room.emptySince !== null &&
          now() - room.emptySince >= EMPTY_ROOM_LIFETIME) ||
        now() - room.updatedAt >= INACTIVE_ROOM_LIFETIME
      )
        closeRoom(room, "This room expired. Create a new game.");
    }
  }
  function createRoom() {
    // Reclaim abandoned rooms even if a create arrives before the timer tick.
    pruneRooms();
    if (rooms.size >= 30)
      fail("Too many rooms are open. Close an old room first.");
    let code;
    do {
      code = Array.from(
        { length: 4 },
        () => CODE_CHARS[randomInt(CODE_CHARS.length)],
      ).join("");
    } while (rooms.has(code));
    const room = {
      code,
      hostToken: token(),
      phase: "lobby",
      paused: false,
      players: new Map(),
      connections: new Set(),
      emptySince: now(),
      settings: {
        mode: "mix",
        rounds: 10,
        seconds: 25,
        autoAdvance: true,
        categories: [...defaultCategories],
      },
      deck: [],
      usedContent: new Set(),
      round: null,
      roundIndex: -1,
      createdAt: now(),
      updatedAt: now(),
    };
    rooms.set(code, room);
    return room;
  }
  function join(code, rawName, avatar = 0) {
    const room = getRoom(code);
    let name =
      typeof rawName === "string" ? rawName.trim().replace(/\s+/g, " ") : "";
    if (!name || name.length > 18 || /[\x00-\x1f\x7f]/.test(name))
      fail("Use a name with 1 to 18 characters.");
    if (
      [...room.players.values()].some(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      )
    )
      fail("That name is taken. Try another one.");
    if (room.players.size >= maxPlayers)
      fail("This room already has eight players.");
    const p = {
      id: token().slice(0, 12),
      token: token(),
      name,
      avatar:
        Number.isInteger(avatar) && avatar >= 0 && avatar < 8 ? avatar : 0,
      score: 0,
      titles: [],
      connections: new Set(),
    };
    room.players.set(p.id, p);
    changed(room);
    return p;
  }
  function connect(code, role, secret, socketId) {
    const room = getRoom(code);
    if (role === "host") host(room, secret);
    else if (role === "player") player(room, secret).connections.add(socketId);
    else if (role !== "tv") fail("Choose a player, host, or TV view.");
    room.connections.add(socketId);
    room.emptySince = null;
    changed(room);
    return room;
  }
  function disconnect(code, secret, socketId) {
    const room = rooms.get(code);
    if (!room) return;
    for (const p of room.players.values())
      if (p.token === secret) p.connections.delete(socketId);
    room.connections.delete(socketId);
    if (!room.connections.size && room.emptySince === null)
      room.emptySince = now();
    changed(room);
  }
  function configure(code, secret, settings) {
    const room = getRoom(code);
    host(room, secret);
    if (room.phase !== "lobby") fail("Change the settings in the lobby.");
    if (
      !settings ||
      !MODES.includes(settings.mode) ||
      ![6, 10, 16].includes(settings.rounds) ||
      ![15, 25, 40].includes(settings.seconds) ||
      typeof settings.autoAdvance !== "boolean"
    )
      fail("Choose valid game settings.");
    if (
      !Array.isArray(settings.categories) ||
      (!settings.categories.length && settings.mode !== "truefalse") ||
      settings.categories.some((c) => !categories.includes(c))
    )
      fail("Choose at least one category.");
    room.settings = {
      mode: settings.mode,
      rounds: settings.rounds,
      seconds: settings.seconds,
      autoAdvance: settings.autoAdvance,
      categories: [
        ...new Set(
          settings.categories.length ? settings.categories : defaultCategories,
        ),
      ],
    };
    changed(room);
  }
  function nextRound(room) {
    room.paused = false;
    if (room.roundIndex + 1 >= room.deck.length) {
      room.phase = "finished";
      changed(room);
      return;
    }
    room.roundIndex++;
    const content = room.deck[room.roundIndex];
    room.usedContent.add(content.id);
    const choices = content.playerVote
      ? [...room.players.values()].map((p) => p.name)
      : content.choices;
    const options = shuffle(choices).map((label, i) => ({
      id: String(i),
      label,
    }));
    room.round = {
      id: token().slice(0, 12),
      content,
      options,
      answers: new Map(),
      eligible: [...room.players.keys()],
      startedAt: now(),
      deadline: now() + room.settings.seconds * 1000,
      result: null,
      remainingMs: null,
    };
    room.phase = "question";
    changed(room);
  }
  function start(code, secret) {
    const room = getRoom(code);
    host(room, secret);
    if (room.phase !== "lobby") fail("The game is already running.");
    if (
      [...room.players.values()].filter((p) => p.connections.size > 0).length <
      2
    )
      fail("At least two connected players are needed.");
    const fresh = (items) => [
      ...shuffle(items.filter((q) => !room.usedContent.has(q.id))),
      ...shuffle(items.filter((q) => room.usedContent.has(q.id))),
    ];
    const piles = shuffle(room.settings.categories).map((category) =>
      fresh(trivia.filter((q) => q.category === category)),
    );
    const questions = [];
    while (piles.some((pile) => pile.length)) {
      for (const pile of piles) if (pile.length) questions.push(pile.shift());
    }
    const awards = fresh(partyAwards);
    const polls = fresh(partyPolls);
    const truths = fresh(truthQuestions);
    let voteIndex = 0;
    room.deck = Array.from({ length: room.settings.rounds }, (_, i) => {
      if (room.settings.mode === "truefalse") return truths.shift();
      const vote =
        room.settings.mode === "party" ||
        (room.settings.mode === "mix" && i % 3 === 2);
      return vote
        ? (voteIndex++ % 2 === 0 ? awards : polls).shift()
        : questions.shift();
    });
    if (room.deck.some((q) => !q))
      fail("There are not enough questions for these settings.");
    room.roundIndex = -1;
    for (const p of room.players.values()) {
      p.score = 0;
      p.titles = [];
    }
    nextRound(room);
  }
  function reveal(room) {
    if (room.phase !== "question") return;
    const round = room.round;
    const counts = Object.fromEntries(round.options.map((o) => [o.id, 0]));
    for (const answer of round.answers.values()) counts[answer]++;
    const high = Math.max(...Object.values(counts));
    const isOpinion = ["award", "poll"].includes(round.content.kind);
    const winningIds =
      round.content.kind === "trivia"
        ? round.options
            .filter((o) => o.label === round.content.answer)
            .map((o) => o.id)
        : round.options
            .filter((o) => high > 0 && counts[o.id] === high)
            .map((o) => o.id);
    const points = round.content.kind === "trivia" ? 1000 : 0;
    const awards = {};
    for (const p of room.players.values()) {
      awards[p.id] = winningIds.includes(round.answers.get(p.id)) ? points : 0;
      p.score += awards[p.id];
      if (
        round.content.kind === "award" &&
        round.options.some(
          (o) => o.label === p.name && winningIds.includes(o.id),
        )
      ) {
        p.titles.push({
          title: round.content.title,
          round: room.roundIndex + 1,
          votes: high,
          tied: winningIds.length > 1,
        });
      }
    }
    round.result = {
      counts,
      winningIds,
      awards,
      explanation: round.content.explanation,
      ...(isOpinion
        ? { opinion: true, title: round.content.title || null }
        : {}),
      ...(round.content.source ? { source: round.content.source } : {}),
    };
    round.deadline = now() + 12000;
    round.remainingMs = null;
    room.phase = "reveal";
    room.paused = false;
    changed(room);
  }
  function answer(code, secret, roundId, choiceId) {
    const room = getRoom(code);
    const p = player(room, secret);
    if (room.phase !== "question" || room.paused)
      fail("Answers are closed for now.");
    if (now() >= room.round.deadline) {
      reveal(room);
      fail("Time is up for this question.");
    }
    if (roundId !== room.round.id)
      fail("That was the previous question. Try the current one.");
    if (!room.round.eligible.includes(p.id))
      fail("You can answer from the next round.");
    if (!room.round.options.some((o) => o.id === choiceId))
      fail("Choose one of the answers on screen.");
    if (room.round.answers.has(p.id)) fail("Your answer is already locked in.");
    room.round.answers.set(p.id, choiceId);
    if (room.round.answers.size === room.round.eligible.length) reveal(room);
    else changed(room);
  }
  function action(code, secret, name) {
    const room = getRoom(code);
    host(room, secret);
    if (name === "close") return closeRoom(room, "The host closed this room.");
    if (name === "end") {
      if (room.phase === "finished") return;
      if (!["question", "reveal"].includes(room.phase))
        fail("Start a game before ending it.");
      // Scores only change on reveal. Discard an open, unscored question.
      room.phase = "finished";
      room.paused = false;
      room.round = null;
      changed(room);
      return;
    }
    if (name === "start") return start(code, secret);
    if (name === "next") {
      if (room.phase !== "reveal")
        fail("Wait for the answers before moving on.");
      nextRound(room);
    } else if (name === "reveal") {
      if (room.phase !== "question") fail("There is no open question.");
      reveal(room);
    } else if (name === "pause") {
      if (!["question", "reveal"].includes(room.phase))
        fail("There is no timer to pause.");
      if (!room.paused) {
        room.round.remainingMs = Math.max(0, room.round.deadline - now());
        room.paused = true;
      } else {
        room.round.deadline = now() + room.round.remainingMs;
        room.round.remainingMs = null;
        room.paused = false;
      }
      changed(room);
    } else if (name === "lobby") {
      if (room.phase !== "finished")
        fail("Finish the game before returning to the lobby.");
      room.phase = "lobby";
      room.paused = false;
      room.round = null;
      room.roundIndex = -1;
      for (const p of room.players.values()) {
        p.score = 0;
        p.titles = [];
      }
      changed(room);
    } else fail("Unknown host action.");
  }
  function remove(code, secret, playerId) {
    const room = getRoom(code);
    host(room, secret);
    if (room.phase !== "lobby")
      fail("Players can only be removed in the lobby.");
    if (!room.players.has(playerId)) fail("That player has already left.");
    for (const socketId of room.players.get(playerId).connections)
      room.connections.delete(socketId);
    room.players.delete(playerId);
    if (!room.connections.size && room.emptySince === null)
      room.emptySince = now();
    changed(room);
  }
  function view(room, role = "tv", secret = null) {
    const me = role === "player" ? player(room, secret) : null;
    const round = room.round;
    return {
      code: room.code,
      phase: room.phase,
      paused: room.paused,
      settings: room.settings,
      roundNumber: room.roundIndex + 1,
      maxPlayers,
      serverTime: now(),
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        titles: p.titles,
        connected: p.connections.size > 0,
        answered: round ? round.answers.has(p.id) : false,
      })),
      me: me
        ? {
            id: me.id,
            name: me.name,
            avatar: me.avatar,
            score: me.score,
            titles: me.titles,
            answer: round?.answers.get(me.id) ?? null,
            eligible:
              room.phase === "lobby" ||
              (["question", "reveal"].includes(room.phase) &&
                Boolean(round?.eligible.includes(me.id))),
          }
        : null,
      round: round
        ? {
            id: round.id,
            kind: round.content.kind,
            format: round.content.format || null,
            category: round.content.category,
            playerVote: Boolean(round.content.playerVote),
            title: round.content.title || null,
            fictional: ["award", "poll"].includes(round.content.kind),
            question: round.content.question,
            options: round.options,
            deadline: round.deadline,
            remainingMs: round.remainingMs,
            answeredCount: round.answers.size,
            expectedCount: round.eligible.length,
            result: room.phase === "question" ? null : round.result,
          }
        : null,
    };
  }
  function tick() {
    pruneRooms();
    for (const room of rooms.values()) {
      if (room.paused || !room.round || now() < room.round.deadline) continue;
      if (room.phase === "question") reveal(room);
      else if (room.phase === "reveal" && room.settings.autoAdvance)
        nextRound(room);
    }
  }
  return {
    rooms,
    getRoom,
    createRoom,
    join,
    connect,
    disconnect,
    configure,
    start,
    answer,
    action,
    remove,
    view,
    tick,
  };
}
