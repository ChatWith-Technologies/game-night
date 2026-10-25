import test from "node:test";
import assert from "node:assert/strict";
import { createGameEngine } from "../server/game.js";
import { truthQuestions } from "../server/truth-content.js";

function setup(mode = "trivia") {
  let clock = 1000;
  const changes = [];
  const game = createGameEngine({
    now: () => clock,
    onChange: (room) => changes.push(room),
  });
  const room = game.createRoom();
  game.connect(room.code, "host", room.hostToken, "host");
  game.configure(room.code, room.hostToken, {
    ...room.settings,
    mode,
    rounds: 6,
    autoAdvance: false,
  });
  const join = (name) => {
    const p = game.join(room.code, name);
    game.connect(room.code, "player", p.token, p.id);
    return p;
  };
  const players = [join("Player One"), join("Player Two")];
  return {
    game,
    room,
    players,
    changes,
    join,
    advance: (ms) => {
      clock += ms;
      game.tick();
    },
  };
}

test("Fact or Fiction has 60 complete sourced facts with two distinct choices", () => {
  assert.equal(truthQuestions.length, 60);
  assert.equal(new Set(truthQuestions.map((q) => q.id)).size, 60);
  assert.equal(new Set(truthQuestions.map((q) => q.question)).size, 60);
  for (const q of truthQuestions) {
    assert.equal(q.kind, "trivia");
    assert.equal(q.format, "truefalse");
    assert.deepEqual(q.choices, ["True", "False"]);
    assert.ok(q.choices.includes(q.answer));
    assert.ok(q.question && q.explanation && q.category);
    assert.match(q.source, /^https:\/\//);
  }
});

test("Fact or Fiction deals 16 unique rounds from all topics and scores factual answers", () => {
  const { game, room, players } = setup("truefalse");
  game.configure(room.code, room.hostToken, {
    ...room.settings,
    rounds: 16,
    categories: [],
  });
  game.start(room.code, room.hostToken);
  assert.equal(new Set(room.deck.map((q) => q.id)).size, 16);
  assert.ok(room.deck.every((q) => truthQuestions.includes(q)));
  const seen = new Set(room.deck.map((q) => q.id));
  for (let i = 0; i < 16; i++) {
    const view = game.view(room, "player", players[0].token);
    assert.equal(view.round.format, "truefalse");
    assert.equal(view.round.options.length, 2);
    assert.equal(view.round.result, null);
    assert.equal(view.me.eligible, true);
    const right = room.round.options.find(
      (o) => o.label === room.round.content.answer,
    );
    const wrong = room.round.options.find((o) => o.id !== right.id);
    game.answer(room.code, players[0].token, room.round.id, right.id);
    game.answer(room.code, players[1].token, room.round.id, wrong.id);
    assert.equal(players[0].score, (i + 1) * 1000);
    assert.equal(players[1].score, 0);
    assert.ok(!room.round.result.opinion);
    game.action(room.code, room.hostToken, "next");
  }
  assert.equal(room.phase, "finished");
  game.action(room.code, room.hostToken, "lobby");
  game.start(room.code, room.hostToken);
  assert.ok(room.deck.every((q) => !seen.has(q.id)));
});

test("late arrivals wait for the next round without changing votes or completion counts", () => {
  const { game, room, players, join } = setup("party");
  game.start(room.code, room.hostToken);
  const options = structuredClone(room.round.options);
  const expected = [...room.round.eligible];
  const third = join("Late Player");
  assert.equal(game.view(room, "player", third.token).me.eligible, false);
  assert.deepEqual(room.round.options, options);
  assert.deepEqual(room.round.eligible, expected);
  assert.throws(
    () => game.answer(room.code, third.token, room.round.id, options[0].id),
    /next round/,
  );
  players.forEach((p) =>
    game.answer(room.code, p.token, room.round.id, options[0].id),
  );
  assert.equal(room.phase, "reveal");
  assert.equal(room.round.answers.size, 2);
  const fourth = join("Reveal Arrival");
  assert.equal(game.view(room, "player", fourth.token).me.eligible, false);
  game.action(room.code, room.hostToken, "next");
  for (const p of [...players, third, fourth]) {
    assert.equal(game.view(room, "player", p.token).me.eligible, true);
    game.answer(room.code, p.token, room.round.id, "0");
  }
  assert.equal(room.phase, "reveal");
  assert.equal(room.round.answers.size, 4);
  game.action(room.code, room.hostToken, "next");
  assert.deepEqual(
    new Set(room.round.options.map((o) => o.label)),
    new Set([...players, third, fourth].map((p) => p.name)),
  );
});

test("ending early marks only displayed prompts as used", () => {
  const { game, room } = setup("truefalse");
  game.configure(room.code, room.hostToken, {
    ...room.settings,
    rounds: 16,
  });
  game.start(room.code, room.hostToken);
  const shown = room.round.content.id;
  assert.equal(room.deck.length, 16);
  assert.deepEqual([...room.usedContent], [shown]);
  game.action(room.code, room.hostToken, "end");
  assert.deepEqual([...room.usedContent], [shown]);
  game.action(room.code, room.hostToken, "lobby");
  game.start(room.code, room.hostToken);
  assert.ok(room.deck.every((q) => q.id !== shown));
  assert.equal(room.usedContent.size, 2);
});

test("ending an open question preserves earned points and discards unfinished answers", () => {
  const { game, room, players, advance, join } = setup();
  game.start(room.code, room.hostToken);
  const right = room.round.options.find(
    (o) => o.label === room.round.content.answer,
  ).id;
  players.forEach((p) => game.answer(room.code, p.token, room.round.id, right));
  game.action(room.code, room.hostToken, "next");
  const unfinishedId = room.round.id;
  const nextRight = room.round.options.find(
    (o) => o.label === room.round.content.answer,
  ).id;
  game.answer(room.code, players[0].token, unfinishedId, nextRight);
  assert.throws(() => game.action(room.code, players[0].token, "end"), /host/);
  assert.equal(room.phase, "question");
  game.action(room.code, room.hostToken, "pause");
  game.action(room.code, room.hostToken, "end");
  assert.equal(room.phase, "finished");
  assert.equal(room.round, null);
  assert.equal(room.paused, false);
  assert.deepEqual(
    players.map((p) => p.score),
    [1000, 1000],
  );
  game.action(room.code, room.hostToken, "end");
  advance(60000);
  assert.equal(room.phase, "finished");
  assert.deepEqual(
    players.map((p) => p.score),
    [1000, 1000],
  );
  assert.throws(
    () => game.answer(room.code, players[1].token, unfinishedId, nextRight),
    /closed/,
  );
  const late = join("Rematch Arrival");
  assert.equal(game.view(room, "player", late.token).me.eligible, false);
  game.action(room.code, room.hostToken, "lobby");
  game.start(room.code, room.hostToken);
  assert.equal(game.view(room, "player", late.token).me.eligible, true);
  assert.ok([...room.players.values()].every((p) => p.score === 0));
});

test("ending at reveal keeps party titles and requires a running game", () => {
  const { game, room, players } = setup("party");
  assert.throws(() => game.action(room.code, room.hostToken, "end"), /Start/);
  game.start(room.code, room.hostToken);
  const choice = room.round.options.find((o) => o.label === players[0].name).id;
  players.forEach((p) =>
    game.answer(room.code, p.token, room.round.id, choice),
  );
  const titles = structuredClone(players[0].titles);
  game.action(room.code, room.hostToken, "end");
  assert.equal(room.phase, "finished");
  assert.deepEqual(players[0].titles, titles);
  assert.equal(titles.length, 1);
  assert.deepEqual(
    players.map((p) => p.score),
    [0, 0],
  );
});

test("only the host can close a room and closed capabilities cannot be reused", () => {
  const { game, room, players, changes } = setup();
  assert.throws(
    () => game.action(room.code, players[0].token, "close"),
    /host/,
  );
  assert.equal(game.rooms.size, 1);
  game.action(room.code, room.hostToken, "close");
  assert.equal(game.rooms.size, 0);
  assert.deepEqual(changes.at(-1), {
    code: room.code,
    expired: true,
    message: "The host closed this room.",
  });
  assert.throws(
    () => game.action(room.code, room.hostToken, "close"),
    /closed/,
  );
  assert.throws(
    () => game.connect(room.code, "player", players[0].token, "again"),
    /closed/,
  );
  assert.throws(() => game.getRoom(room.code), /closed/);
});

test("capacity checks reclaim abandoned rooms before the next timer tick", () => {
  let clock = 0;
  const notices = [];
  const game = createGameEngine({
    now: () => clock,
    onChange: (room) => notices.push(room),
  });
  for (let i = 0; i < 30; i++) game.createRoom();
  assert.throws(() => game.createRoom(), /Too many rooms/);
  clock = 10 * 60 * 1000 - 1;
  assert.throws(() => game.createRoom(), /Too many rooms/);
  clock++;
  const newRoom = game.createRoom();
  assert.equal(game.rooms.size, 1);
  assert.equal(game.getRoom(newRoom.code), newRoom);
  assert.equal(notices.filter((room) => room.expired).length, 30);
});

test("empty-room expiry starts only after the last live connection leaves and resets on reconnect", () => {
  const { game, room, players, advance } = setup();
  game.connect(room.code, "tv", null, "tv");
  advance(10 * 60 * 1000);
  assert.equal(game.rooms.size, 1);
  game.disconnect(room.code, room.hostToken, "host");
  for (const p of players) game.disconnect(room.code, p.token, p.id);
  advance(10 * 60 * 1000);
  assert.equal(game.rooms.size, 1, "the TV is still a live room connection");
  game.disconnect(room.code, null, "tv");
  advance(9 * 60 * 1000);
  game.connect(room.code, "host", room.hostToken, "returning-host");
  advance(2 * 60 * 1000);
  assert.equal(game.rooms.size, 1);
  game.disconnect(room.code, room.hostToken, "returning-host");
  advance(10 * 60 * 1000);
  assert.equal(game.rooms.size, 0);
});
