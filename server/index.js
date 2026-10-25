import express from "express";
import { createServer } from "node:http";
import { networkInterfaces, hostname } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { Server } from "socket.io";
import QRCode from "qrcode";
import { createGameEngine } from "./game.js";
import { trivia, categories } from "./content.js";
import { partyAwards, partyPolls } from "./party-content.js";
import { truthQuestions } from "./truth-content.js";
import { loadEnvFile } from "node:process";
import { isIP } from "node:net";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf8"),
);
try {
  loadEnvFile(path.join(ROOT, ".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const PORT = Number(process.env.PORT || 3210);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");
const distDirectory = "dist";
const contentCount = {
  trivia: trivia.length,
  truefalse: truthQuestions.length,
  awards: partyAwards.length,
  polls: partyPolls.length,
};
const dev = process.argv.includes("--dev");
const isPrivate = (address) => {
  const ip = (address || "").replace(/^::ffff:/, "");
  return (
    ip === "::1" ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
};
const addresses = Object.entries(networkInterfaces()).flatMap(
  ([name, entries]) =>
    entries
      .filter(
        (entry) =>
          entry.family === "IPv4" &&
          !entry.internal &&
          isPrivate(entry.address) &&
          !/vEthernet|WSL|Docker|Virtual|Loopback/i.test(name),
      )
      .map((entry) => ({ name, address: entry.address })),
);
const lanIP = process.env.GAME_LAN_IP || addresses[0]?.address || "127.0.0.1";
if (isIP(lanIP) !== 4 || !isPrivate(lanIP))
  throw new Error(
    "GAME_LAN_IP must be the computer's private IPv4 address, such as 192.168.1.50.",
  );
const baseUrl = "http://" + lanIP + ":" + PORT;
const validHosts = new Set([
  "localhost:" + PORT,
  "127.0.0.1:" + PORT,
  "[::1]:" + PORT,
  hostname().toLowerCase() + ":" + PORT,
  ...addresses.map((a) => a.address + ":" + PORT),
  lanIP + ":" + PORT,
]);
for (const host of [...validHosts])
  validHosts.add(new URL("http://" + host).host);
function allowed(req) {
  if (
    !isPrivate(req.socket.remoteAddress) ||
    !validHosts.has(String(req.headers.host).toLowerCase())
  )
    return false;
  if (req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      if (
        origin.protocol !== "http:" ||
        !validHosts.has(origin.host.toLowerCase())
      )
        return false;
    } catch {
      return false;
    }
  }
  return true;
}

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (!allowed(req))
    return res
      .status(403)
      .send("This game is only available on the home network.");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
  if (!dev)
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
  next();
});
const http = createServer(app);
const io = new Server(http, {
  maxHttpBufferSize: 8192,
  allowRequest: (req, callback) => callback(null, allowed(req)),
});

const engine = createGameEngine({ onChange: broadcast });
function broadcast(room) {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.code !== room.code) continue;
    if (room.expired) {
      socket.emit("room:closed", {
        message: room.message || "This room expired. Create a new game.",
      });
      socket.data.code = null;
      socket.data.role = null;
      socket.data.secret = null;
      continue;
    }
    try {
      socket.emit(
        "room:state",
        engine.view(room, socket.data.role, socket.data.secret),
      );
    } catch {
      socket.emit("room:closed", {
        message: "The host removed you from this room.",
      });
      socket.data.code = null;
    }
  }
}
function detach(socket) {
  if (socket.data.code)
    engine.disconnect(socket.data.code, socket.data.secret, socket.id);
  socket.data.code = null;
}
function attach(socket, code, role, secret) {
  const room = engine.getRoom(code);
  // Validate credentials before replacing the connection's existing session.
  if (role === "host" && room.hostToken !== secret)
    throw new Error("Only the host can open the host controls.");
  if (role === "player") engine.view(room, role, secret);
  if (!["player", "tv", "host"].includes(role))
    throw new Error("Choose a valid view.");
  detach(socket);
  socket.data.code = room.code;
  socket.data.role = role;
  socket.data.secret = secret;
  engine.connect(room.code, role, secret, socket.id);
  return engine.view(room, role, secret);
}
const creationRates = new Map();
io.on("connection", (socket) => {
  let windowStart = Date.now();
  let calls = 0;
  function handle(event, fn) {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        if (Date.now() - windowStart > 10000) {
          calls = 0;
          windowStart = Date.now();
        }
        if (++calls > 60)
          throw new Error("Too many taps. Wait a moment and try again.");
        if (!payload || typeof payload !== "object" || Array.isArray(payload))
          throw new Error("Please try again.");
        reply({ ok: true, ...fn(payload) });
      } catch (error) {
        reply({ ok: false, error: error.message || "Please try again." });
      }
    });
  }
  handle("room:create", () => {
    const ip = socket.handshake.address;
    const limit = creationRates.get(ip) || { start: Date.now(), count: 0 };
    if (Date.now() - limit.start > 60000) {
      limit.start = Date.now();
      limit.count = 0;
    }
    if (limit.count++ >= 10)
      throw new Error("Wait a minute before making another room.");
    creationRates.set(ip, limit);
    const room = engine.createRoom();
    return {
      code: room.code,
      hostToken: room.hostToken,
      state: attach(socket, room.code, "host", room.hostToken),
    };
  });
  handle("room:join", ({ code, name, avatar }) => {
    const p = engine.join(code, name, avatar);
    const state = attach(socket, code, "player", p.token);
    return { code: state.code, playerToken: p.token, state };
  });
  handle("room:attach", ({ code, role, secret }) => ({
    state: attach(socket, code, role, secret),
  }));
  handle("room:settings", ({ hostToken, settings }) => {
    engine.configure(socket.data.code, hostToken, settings);
    return {};
  });
  handle("host:action", ({ hostToken, action }) => {
    engine.action(socket.data.code, hostToken, action);
    return {};
  });
  handle("host:remove", ({ hostToken, playerId }) => {
    engine.remove(socket.data.code, hostToken, playerId);
    return {};
  });
  handle("player:answer", ({ roundId, choiceId }) => {
    if (socket.data.role !== "player")
      throw new Error("Join as a player to answer.");
    engine.answer(socket.data.code, socket.data.secret, roundId, choiceId);
    return {};
  });
  socket.on("disconnect", () => detach(socket));
});

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    app: "chatwith-game-night",
    version,
    port: PORT,
  }),
);
app.get("/api/config", (_req, res) =>
  res.json({
    baseUrl,
    categories,
    contentCount,
    maxPlayers: 8,
    addresses: addresses.map((a) => ({
      name: a.name,
      url: `http://${a.address}:${PORT}`,
    })),
  }),
);
app.get("/api/qr", async (req, res) => {
  const code = String(req.query.room || "").toUpperCase();
  if (code && !/^[A-Z]{4}$/.test(code))
    return res.status(400).send("Invalid room code.");
  const target = baseUrl + "/join" + (code ? "?room=" + code : "");
  try {
    res.type("svg").send(
      await QRCode.toString(target, {
        type: "svg",
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#162b27", light: "#ffffff" },
      }),
    );
  } catch {
    res.status(500).send("Could not create the code. Use the address instead.");
  }
});
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

if (dev) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    root: ROOT,
    server: { middlewareMode: true, hmr: { server: http } },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  if (!existsSync(path.join(ROOT, distDirectory, "index.html")))
    throw new Error("Run npm run build before starting the game.");
  app.use(express.static(path.join(ROOT, distDirectory), { etag: false }));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(ROOT, distDirectory, "index.html")),
  );
}
// Express otherwise exposes stack traces and local paths when NODE_ENV is unset.
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  res
    .status(status)
    .type("text/plain")
    .send(
      status < 500
        ? "The request could not be read. Check the address and try again."
        : "The game could not complete this request. Please try again.",
    );
});
const interval = setInterval(() => engine.tick(), 200);
interval.unref();
const cleanRates = setInterval(() => {
  for (const [ip, rate] of creationRates)
    if (Date.now() - rate.start > 120000) creationRates.delete(ip);
}, 60000);
cleanRates.unref();
http.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${PORT} is already in use. Stop the other game, or set a different PORT in .env. No running game was changed.`
      : error.message,
  );
  process.exit(1);
});
http.listen(PORT, "0.0.0.0", () => {
  console.log("Game Night by ChatWith is ready.");
  console.log("PC: http://localhost:" + PORT);
  console.log("Phones: " + baseUrl);
  console.log("TV: " + baseUrl + "/tv");
  console.log("Keep this PC awake. Rooms reset when this server stops.");
});
function shutdown() {
  clearInterval(interval);
  clearInterval(cleanRates);
  io.close();
  http.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
