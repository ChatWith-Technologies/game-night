import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { io } from "socket.io-client";

let BASE;
let port;
const root = fileURLToPath(new URL("../", import.meta.url));
let server;
const sockets = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  BASE = "http://127.0.0.1:" + port;
  server = spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), GAME_LAN_IP: "127.0.0.1" },
    windowsHide: true,
    stdio: "pipe",
  });
  let errors = "";
  server.stderr.on("data", (data) => {
    errors += data;
  });
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null)
      throw new Error("Test server stopped: " + errors);
    try {
      const result = await fetch(BASE + "/api/health");
      if (result.ok) return;
    } catch {
      /* Starting. */
    }
    await delay(100);
  }
  throw new Error("Test server did not start: " + errors);
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (server && server.exitCode === null) {
    const ended = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await ended;
  }
});
async function connect(options = {}) {
  const socket = io(BASE, {
    autoConnect: false,
    transports: ["websocket"],
    reconnection: false,
    ...options,
  });
  sockets.push(socket);
  socket.on("room:state", (state) => {
    socket.state = state;
  });
  socket.on("room:closed", (notice) => {
    socket.closed = notice;
    socket.state = null;
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
    socket.connect();
  });
  return socket;
}
async function call(socket, name, data = {}) {
  return socket.timeout(3000).emitWithAck(name, data);
}
async function until(condition) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await delay(20);
  }
  throw new Error("Expected state did not arrive.");
}

test("HTTP and WebSocket reject an unrelated website origin and an unknown hostname", async () => {
  const cors = await fetch(BASE + "/api/config", {
    headers: { Origin: "https://unrelated.example" },
  });
  assert.equal(cors.status, 403);
  const hostStatus = await new Promise((resolve, reject) => {
    const req = request(
      BASE + "/api/config",
      { headers: { Host: "unrelated.example:" + port } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(hostStatus, 403);
  await assert.rejects(
    connect({ extraHeaders: { Origin: "https://unrelated.example" } }),
  );
});

test("server exposes a local join address and a QR image without host credentials", async () => {
  const config = await (await fetch(BASE + "/api/config")).json();
  assert.equal(config.baseUrl, BASE);
  assert.equal(config.maxPlayers, 8);
  assert.deepEqual(config.contentCount, {
    trivia: 200,
    truefalse: 60,
    awards: 44,
    polls: 24,
  });
  const health = await (await fetch(BASE + "/api/health")).json();
  const { version } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(health.version, version);
  const qr = await fetch(BASE + "/api/qr?room=ABCD");
  assert.equal(qr.status, 200);
  assert.match(qr.headers.get("content-type"), /image\/svg\+xml/);
  assert.match(await qr.text(), /^<svg/);
  assert.equal(
    (await fetch(BASE + "/api/qr?room=ABCD%23host%3Dtest")).status,
    400,
  );
  const page = await fetch(BASE + "/tv/ABCD");
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /connect-src 'self'/,
  );
  assert.match(await page.text(), /Game Night by ChatWith/);
});

test("real five-player sockets keep answers private, reject host impersonation, and restore a player", async () => {
  const host = await connect();
  const created = await call(host, "room:create");
  assert.equal(created.ok, true);
  const { code, hostToken } = created;
  const tv = await connect();
  assert.equal((await call(tv, "room:attach", { code, role: "tv" })).ok, true);
  const players = [];
  for (let i = 0; i < 5; i++) {
    const socket = await connect();
    const joined = await call(socket, "room:join", {
      code,
      name: "Network player " + i,
      avatar: i,
    });
    assert.equal(joined.ok, true);
    players.push({ socket, token: joined.playerToken });
  }
  const fake = await call(players[0].socket, "host:action", {
    hostToken: players[0].token,
    action: "start",
  });
  assert.equal(fake.ok, false);
  assert.match(fake.error, /host/);
  const impersonate = await call(tv, "room:attach", {
    code,
    role: "host",
    secret: code,
  });
  assert.equal(impersonate.ok, false);
  assert.equal(
    (await call(host, "host:action", { hostToken, action: "start" })).ok,
    true,
  );
  await until(() => tv.state.phase === "question");
  const publicState = JSON.stringify(tv.state);
  assert.ok(!publicState.includes(hostToken));
  for (const p of players) assert.ok(!publicState.includes(p.token));
  assert.equal(tv.state.round.result, null);
  const roundId = tv.state.round.id;
  assert.equal(
    (await call(players[0].socket, "player:answer", { roundId, choiceId: "2" }))
      .ok,
    true,
  );
  assert.equal(
    (await call(players[0].socket, "player:answer", { roundId, choiceId: "1" }))
      .ok,
    false,
  );
  await until(() => tv.state.round.answeredCount === 1);
  assert.equal(tv.state.round.answers, undefined);
  assert.equal(tv.state.players[0].answer, undefined);
  players[0].socket.disconnect();
  const restored = await connect();
  const state = await call(restored, "room:attach", {
    code,
    role: "player",
    secret: players[0].token,
  });
  assert.equal(state.state.me.answer, "2");
  assert.equal(state.state.players.length, 5);
  assert.equal(
    (await call(tv, "player:answer", { roundId, choiceId: "0" })).ok,
    false,
  );
  for (const p of players.slice(1))
    assert.equal(
      (await call(p.socket, "player:answer", { roundId, choiceId: "0" })).ok,
      true,
    );
  await until(() => tv.state.phase === "reveal");
  assert.equal(tv.state.round.answeredCount, 5);
  assert.equal(tv.state.round.result.winningIds.length, 1);
});

test("malformed URLs return a useful error without stack traces or local file paths", async () => {
  for (const path of ["/tv/%FF", "/play/%E0%A4%A"]) {
    const response = await fetch(BASE + path);
    const message = await response.text();
    assert.equal(response.status, 400);
    assert.match(message, /Check the address/);
    assert.doesNotMatch(
      message,
      /URIError|node_modules|\bat Layer\b|[A-Z]:[\\/]|\/Users\/|\/home\//,
    );
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("late players wait one round, then play; host end and close preserve rights and notify every screen", async () => {
  const host = await connect();
  const created = await call(host, "room:create");
  assert.equal(created.ok, true);
  const { code, hostToken } = created;
  const tv = await connect();
  assert.equal((await call(tv, "room:attach", { code, role: "tv" })).ok, true);
  assert.equal(
    (
      await call(host, "room:settings", {
        hostToken,
        settings: {
          ...created.state.settings,
          mode: "truefalse",
          rounds: 6,
          autoAdvance: false,
        },
      })
    ).ok,
    true,
  );
  const players = [];
  for (let i = 0; i < 2; i++) {
    const socket = await connect();
    const joined = await call(socket, "room:join", {
      code,
      name: "Original " + i,
    });
    assert.equal(joined.ok, true);
    players.push({ socket, token: joined.playerToken });
  }
  assert.equal(
    (await call(host, "host:action", { hostToken, action: "start" })).ok,
    true,
  );
  await until(() => tv.state?.phase === "question");
  const firstId = tv.state.round.id;
  const options = structuredClone(tv.state.round.options);
  assert.equal(tv.state.round.format, "truefalse");
  assert.equal(options.length, 2);
  const late = await connect();
  const joined = await call(late, "room:join", { code, name: "Late Arrival" });
  assert.equal(joined.ok, true);
  assert.equal(joined.state.me.eligible, false);
  assert.equal(joined.state.round.expectedCount, 2);
  assert.deepEqual(joined.state.round.options, options);
  const earlyAnswer = await call(late, "player:answer", {
    roundId: firstId,
    choiceId: "0",
  });
  assert.equal(earlyAnswer.ok, false);
  assert.match(earlyAnswer.error, /next round/);
  assert.equal(
    (
      await call(late, "host:action", {
        hostToken: joined.playerToken,
        action: "end",
      })
    ).ok,
    false,
  );
  for (const p of players)
    assert.equal(
      (
        await call(p.socket, "player:answer", {
          roundId: firstId,
          choiceId: "0",
        })
      ).ok,
      true,
    );
  await until(() => tv.state.phase === "reveal");
  assert.equal(tv.state.round.answeredCount, 2);
  assert.equal(
    (await call(host, "host:action", { hostToken, action: "next" })).ok,
    true,
  );
  await until(() => late.state.me.eligible && late.state.round.id !== firstId);
  assert.equal(late.state.round.expectedCount, 3);
  assert.equal(
    (
      await call(late, "player:answer", {
        roundId: late.state.round.id,
        choiceId: "1",
      })
    ).ok,
    true,
  );
  const scores = tv.state.players.map((p) => [p.id, p.score]);
  assert.equal(
    (await call(host, "host:action", { hostToken, action: "end" })).ok,
    true,
  );
  await until(() => tv.state.phase === "finished");
  assert.equal(tv.state.round, null);
  assert.deepEqual(
    tv.state.players.map((p) => [p.id, p.score]),
    scores,
  );
  assert.equal(
    (await call(host, "host:action", { hostToken, action: "end" })).ok,
    true,
  );
  assert.equal(
    (
      await call(late, "host:action", {
        hostToken: joined.playerToken,
        action: "close",
      })
    ).ok,
    false,
  );
  assert.equal(
    (await call(host, "host:action", { hostToken, action: "close" })).ok,
    true,
  );
  const screens = [host, tv, late, ...players.map((p) => p.socket)];
  await until(() => screens.every((socket) => socket.closed));
  for (const socket of screens)
    assert.deepEqual(socket.closed, { message: "The host closed this room." });
  assert.equal(
    (await call(host, "host:action", { hostToken, action: "close" })).ok,
    false,
  );
  const oldSeat = await call(late, "room:attach", {
    code,
    role: "player",
    secret: joined.playerToken,
  });
  assert.equal(oldSeat.ok, false);
  assert.match(oldSeat.error, /closed/);
  assert.equal((await call(tv, "room:attach", { code, role: "tv" })).ok, false);
});
