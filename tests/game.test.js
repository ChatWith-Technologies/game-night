import test from "node:test";
import assert from "node:assert/strict";
import { createGameEngine } from "../server/game.js";
import { trivia, categories, defaultCategories } from "../server/content.js";
import { partyAwards, partyPolls } from "../server/party-content.js";

function setup(mode = "trivia", count = 5) {
  let clock = 100000;
  const game = createGameEngine({ now: () => clock });
  const room = game.createRoom();
  game.configure(room.code, room.hostToken, {
    mode,
    rounds: 6,
    seconds: 15,
    autoAdvance: false,
    categories,
  });
  const players = Array.from({ length: count }, (_, i) => {
    const p = game.join(room.code, "Player " + (i + 1), i);
    game.connect(room.code, "player", p.token, "socket-" + i);
    return p;
  });
  const advance = (ms) => {
    clock += ms;
    game.tick();
  };
  return { game, room, players, advance };
}

test("local content has 200 unique trivia questions and 68 complete party prompts", () => {
  assert.equal(trivia.length, 200);
  assert.equal(partyAwards.length, 44);
  assert.equal(partyPolls.length, 24);
  const all = [...trivia, ...partyAwards, ...partyPolls];
  assert.equal(new Set(all.map((q) => q.id)).size, all.length);
  assert.equal(new Set(all.map((q) => q.question)).size, all.length);
  for (const q of all) {
    assert.ok(q.question && q.explanation);
    assert.equal(q.choices.length, q.playerVote ? 0 : 4);
    assert.equal(new Set(q.choices).size, q.playerVote ? 0 : 4);
    for (const option of q.choices)
      assert.ok(typeof option === "string" && option.length);
    if (q.kind === "trivia") assert.ok(q.choices.includes(q.answer));
  }
});

test("the default mix covers five general topics and alternates vote types", () => {
  const { game, room } = setup("mix");
  game.configure(room.code, room.hostToken, {
    ...room.settings,
    rounds: 10,
    categories: defaultCategories,
  });
  game.start(room.code, room.hostToken);
  const firstTopics = room.deck
    .filter((q) => q.kind === "trivia")
    .slice(0, 5)
    .map((q) => q.category);
  assert.deepEqual(new Set(firstTopics), new Set(defaultCategories));
  assert.deepEqual(
    room.deck
      .filter((q) => q.kind !== "trivia")
      .map((q) => Boolean(q.playerVote)),
    [true, false, true],
  );
  assert.equal(new Set(room.deck.map((q) => q.id)).size, 10);
  const fresh = game.createRoom();
  assert.deepEqual(fresh.settings.categories, defaultCategories);
});

test("party votes use eight current names, accept self-votes, and award titles without points", () => {
  const { game, room, players } = setup("party", 8);
  game.start(room.code, room.hostToken);
  const view = game.view(room, "tv");
  assert.equal(view.round.playerVote, true);
  assert.equal(view.round.result, null);
  assert.deepEqual(
    new Set(view.round.options.map((o) => o.label)),
    new Set(players.map((p) => p.name)),
  );
  assert.equal(new Set(view.round.options.map((o) => o.id)).size, 8);
  assert.ok(
    view.round.options.every(
      (o) => Object.keys(o).sort().join() === "id,label",
    ),
  );
  const nominated = room.round.options.find(
    (o) => o.label === players[7].name,
  ).id;
  players.forEach((p) =>
    game.answer(room.code, p.token, room.round.id, nominated),
  );
  assert.ok(players.every((p) => p.score === 0));
  assert.equal(players[7].titles.length, 1);
  assert.equal(players[7].titles[0].votes, 8);
  assert.equal(room.round.result.opinion, true);
  assert.equal(room.round.result.counts[nominated], 8);
  game.action(room.code, room.hostToken, "next");
  assert.equal(game.view(room, "tv").round.playerVote, false);
});

test("five players complete six trivia rounds with exact server scores and no answer leaks", () => {
  const { game, room, players } = setup();
  game.start(room.code, room.hostToken);
  const seen = new Set();
  for (let roundNumber = 0; roundNumber < 6; roundNumber++) {
    assert.equal(room.phase, "question");
    seen.add(room.round.content.id);
    const answer = room.round.options.find(
      (o) => o.label === room.round.content.answer,
    ).id;
    for (const role of ["host", "tv", "player"]) {
      const view = game.view(
        room,
        role,
        role === "player" ? players[0].token : null,
      );
      assert.equal(view.round.result, null);
      assert.equal(view.round.answer, undefined);
      assert.equal(view.round.content, undefined);
      assert.equal(view.hostToken, undefined);
      assert.ok(view.players.every((p) => p.token === undefined));
    }
    const wrong = room.round.options.find((o) => o.id !== answer).id;
    players.forEach((p, i) =>
      game.answer(room.code, p.token, room.round.id, i === 0 ? answer : wrong),
    );
    assert.equal(room.phase, "reveal");
    assert.equal(players[0].score, (roundNumber + 1) * 1000);
    assert.equal(players[1].score, 0);
    game.action(room.code, room.hostToken, "next");
  }
  assert.equal(room.phase, "finished");
  assert.equal(seen.size, 6);
  assert.equal(players[0].score, 6000);
});

test("party ties give titles to both nominees, with no trivia points", () => {
  const { game, room, players, advance } = setup("party");
  game.start(room.code, room.hostToken);
  const [a, b] = room.round.options;
  players
    .slice(0, 4)
    .forEach((p, i) =>
      game.answer(room.code, p.token, room.round.id, i < 2 ? a.id : b.id),
    );
  advance(15001);
  assert.equal(room.phase, "reveal");
  assert.deepEqual(
    new Set(room.round.result.winningIds),
    new Set([a.id, b.id]),
  );
  assert.deepEqual(
    players.map((p) => p.score),
    [0, 0, 0, 0, 0],
  );
  const recipients = players.filter((p) => p.titles.length);
  assert.deepEqual(
    new Set(recipients.map((p) => p.name)),
    new Set([a.label, b.label]),
  );
  assert.ok(
    recipients.every((p) => p.titles[0].tied && p.titles[0].votes === 2),
  );
});

test("a rematch uses new prompts before repeating, and clears scores and titles", () => {
  const { game, room, players } = setup("party");
  game.start(room.code, room.hostToken);
  const first = new Set(room.deck.map((q) => q.id));
  for (let round = 0; round < 6; round++) {
    players.forEach((p) => game.answer(room.code, p.token, room.round.id, "0"));
    game.action(room.code, room.hostToken, "next");
  }
  assert.ok(players.some((p) => p.titles.length));
  game.action(room.code, room.hostToken, "lobby");
  assert.ok(players.every((p) => p.titles.length === 0 && p.score === 0));
  game.start(room.code, room.hostToken);
  assert.ok(room.deck.every((q) => !first.has(q.id)));
});

test("every topic supports the longest trivia game without duplicate questions", () => {
  for (const category of categories) {
    const { game, room } = setup();
    game.configure(room.code, room.hostToken, {
      ...room.settings,
      rounds: 16,
      categories: [category],
    });
    game.start(room.code, room.hostToken);
    assert.equal(room.deck.length, 16);
    assert.equal(new Set(room.deck.map((q) => q.id)).size, 16);
    assert.ok(
      room.deck.every((q) => q.kind === "trivia" && q.category === category),
    );
  }
});

test("rooms expire after six inactive hours", () => {
  const { game, room, advance } = setup();
  advance(6 * 60 * 60 * 1000 + 1);
  assert.equal(game.rooms.size, 0);
  assert.throws(() => game.getRoom(room.code), /closed/);
});

test("no votes produces no winners and no points", () => {
  const { game, room, players, advance } = setup("party");
  game.start(room.code, room.hostToken);
  advance(15001);
  assert.deepEqual(room.round.result.winningIds, []);
  assert.ok(players.every((p) => p.score === 0 && p.titles.length === 0));
});

test("answers cannot be changed or sent for an old round", () => {
  const { game, room, players } = setup();
  game.start(room.code, room.hostToken);
  const oldId = room.round.id;
  game.answer(room.code, players[0].token, oldId, "0");
  assert.throws(
    () => game.answer(room.code, players[0].token, oldId, "1"),
    /locked/,
  );
  game.action(room.code, room.hostToken, "reveal");
  game.action(room.code, room.hostToken, "next");
  assert.throws(
    () => game.answer(room.code, players[0].token, oldId, "1"),
    /previous/,
  );
  assert.throws(
    () => game.answer(room.code, players[0].token, room.round.id, "10"),
    /Choose/,
  );
});

test("one player cannot see another player’s locked answer", () => {
  const { game, room, players } = setup();
  game.start(room.code, room.hostToken);
  game.answer(room.code, players[0].token, room.round.id, "1");
  assert.equal(game.view(room, "player", players[0].token).me.answer, "1");
  assert.equal(game.view(room, "player", players[1].token).me.answer, null);
  assert.equal(game.view(room, "tv").players[0].answer, undefined);
});

test("pause preserves remaining time and blocks answers; resume completes once", () => {
  const { game, room, players, advance } = setup();
  game.start(room.code, room.hostToken);
  advance(5000);
  game.action(room.code, room.hostToken, "pause");
  advance(60000);
  assert.equal(room.phase, "question");
  assert.equal(room.round.remainingMs, 10000);
  assert.throws(
    () => game.answer(room.code, players[0].token, room.round.id, "0"),
    /closed/,
  );
  game.action(room.code, room.hostToken, "pause");
  advance(9999);
  assert.equal(room.phase, "question");
  advance(2);
  assert.equal(room.phase, "reveal");
  const scores = players.map((p) => p.score);
  advance(60000);
  assert.deepEqual(
    players.map((p) => p.score),
    scores,
  );
});

test("reconnection keeps name, points and submitted answer; disconnect does not end a round early", () => {
  const { game, room, players } = setup();
  game.start(room.code, room.hostToken);
  game.answer(room.code, players[0].token, room.round.id, "0");
  game.disconnect(room.code, players[0].token, "socket-0");
  assert.equal(game.view(room).players[0].connected, false);
  assert.equal(room.phase, "question");
  game.connect(room.code, "player", players[0].token, "new-socket");
  assert.equal(game.view(room, "player", players[0].token).me.answer, "0");
  assert.equal(room.players.size, 5);
  assert.equal(game.view(room).players[0].connected, true);
});

test("host rights, capacity, unique names and lobby boundaries are enforced", () => {
  const { game, room, players } = setup("trivia", 8);
  assert.throws(() => game.join(room.code, "Ninth"), /eight/);
  assert.throws(() => game.join(room.code, "player 1"), /taken/);
  assert.throws(
    () => game.action(room.code, players[0].token, "start"),
    /host/,
  );
  game.start(room.code, room.hostToken);
  assert.throws(() => game.join(room.code, "Late arrival"), /eight/);
  assert.throws(
    () => game.remove(room.code, room.hostToken, players[0].id),
    /lobby/,
  );
  assert.throws(
    () => game.action(room.code, room.hostToken, "lobby"),
    /Finish/,
  );
});

test("mix includes group votes, automatic advancement, and a reusable lobby", () => {
  const { game, room, players, advance } = setup("mix");
  game.configure(room.code, room.hostToken, {
    ...room.settings,
    autoAdvance: true,
  });
  game.start(room.code, room.hostToken);
  assert.deepEqual(
    room.deck.map((q) => q.kind),
    ["trivia", "trivia", "award", "trivia", "trivia", "poll"],
  );
  for (let i = 0; i < 6; i++) {
    advance(15001);
    assert.equal(room.phase, "reveal");
    advance(12001);
  }
  assert.equal(room.phase, "finished");
  game.action(room.code, room.hostToken, "lobby");
  assert.equal(room.phase, "lobby");
  assert.equal(room.players.size, 5);
  assert.ok(players.every((p) => p.score === 0));
  game.start(room.code, room.hostToken);
  assert.equal(room.phase, "question");
});

test("an answer at the deadline is not counted even before the timer tick", () => {
  let clock = 0;
  const game = createGameEngine({ now: () => clock });
  const room = game.createRoom();
  const p = game.join(room.code, "One");
  const p2 = game.join(room.code, "Two");
  game.connect(room.code, "player", p.token, "1");
  game.connect(room.code, "player", p2.token, "2");
  game.start(room.code, room.hostToken);
  clock = room.round.deadline;
  assert.throws(
    () => game.answer(room.code, p.token, room.round.id, "0"),
    /Time is up/,
  );
  assert.equal(room.round.answers.size, 0);
  assert.equal(room.phase, "reveal");
});

test("empty categories and invalid settings fail without changing the room", () => {
  const { game, room } = setup();
  assert.throws(
    () =>
      game.configure(room.code, room.hostToken, {
        ...room.settings,
        categories: [],
      }),
    /category/,
  );
  assert.throws(
    () =>
      game.configure(room.code, room.hostToken, {
        ...room.settings,
        seconds: -1,
      }),
    /valid/,
  );
  assert.equal(room.settings.seconds, 15);
});
