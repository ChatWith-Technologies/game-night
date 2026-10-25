import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "@fontsource/bricolage-grotesque/latin-500.css";
import "@fontsource/bricolage-grotesque/latin-600.css";
import "@fontsource/bricolage-grotesque/latin-700.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "./style.css";
import "./party.css";
import { PartyFinished, AwardCabinet } from "./party.jsx";

const socket = io({ autoConnect: false });
const avatars = ["🐸", "🦊", "🐼", "🐙", "🦁", "🦄", "🦖", "🐧"];
const avatarNames = [
  "Frog",
  "Fox",
  "Panda",
  "Octopus",
  "Lion",
  "Unicorn",
  "Dinosaur",
  "Penguin",
];
const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
const modes = {
  mix: {
    name: "The house mix",
    short: "House mix",
    icon: "✳",
    description:
      "Trivia across your favorite topics, with a party vote every third round.",
    tag: "THE CROWD PLEASER",
    color: "lime",
  },
  trivia: {
    name: "Trivia night",
    short: "Trivia",
    icon: "?",
    description:
      "Real facts. Unreasonable confidence. Pick your topics and earn the right to be annoying about it.",
    tag: "FOR THE KNOW-IT-ALLS",
    color: "peach",
  },
  party: {
    name: "Party awards",
    short: "Group votes",
    icon: "↗",
    description:
      "Vote for your friends in ridiculous situations. Win unofficial awards. No right or wrong opinions.",
    tag: "KNOW YOUR PEOPLE",
    color: "lavender",
  },
};
function read(key) {
  try {
    return localStorage.getItem("gamenight:" + key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem("gamenight:" + key, value);
  } catch {
    throw new Error(
      "This browser is blocking saved game details. Allow browser storage, then try again.",
    );
  }
}
function call(event, data = {}) {
  return new Promise((resolve, reject) => {
    if (!socket.connected)
      return reject(new Error("Reconnecting to the PC. Wait a moment."));
    socket.timeout(7000).emit(event, data, (error, result) => {
      if (error)
        reject(
          new Error(
            "The PC did not respond. Check the connection and try again.",
          ),
        );
      else if (!result?.ok)
        reject(new Error(result?.error || "Please try again."));
      else resolve(result);
    });
  });
}
function go(path) {
  window.location.assign(path);
}
function Brand() {
  return (
    <a className="brand" href="/" aria-label="Game Night home">
      <span className="brand-icon" aria-hidden="true">
        g<span>✳</span>
      </span>
      <span>
        GAME NIGHT<span className="brand-sub">BY CHATWITH</span>
      </span>
    </a>
  );
}
function Arrow({ diagonal = false }) {
  return <span aria-hidden="true">{diagonal ? "↗" : "→"}</span>;
}
function Avatar({ value, small = false }) {
  return (
    <span
      className={"avatar avatar-" + value + (small ? " small" : "")}
      aria-label={avatarNames[value]}
    >
      {avatars[value]}
    </span>
  );
}
function Pill({ children, tone = "" }) {
  return <span className={"pill " + tone}>{children}</span>;
}
function Footer() {
  return (
    <footer>
      <span>Friendships tested. Absolutely no qualifications earned.</span>
      <span>
        MADE FOR YOUR LIVING ROOM <span className="tiny-star">✳</span>
      </span>
    </footer>
  );
}

function Home({ run, busy, connected, config }) {
  const [mode, setMode] = useState("mix");
  const [roomCode, setRoomCode] = useState("");
  async function create() {
    const result = await call("room:create");
    write("host:" + result.code, result.hostToken);
    write("lastHost", result.code);
    if (mode !== "mix")
      await call("room:settings", {
        hostToken: result.hostToken,
        settings: { ...result.state.settings, mode },
      });
    go("/host/" + result.code);
  }
  return (
    <>
      <div className="home-hero">
        <section className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" /> YOUR PEOPLE. ONE ROOM. GAME ON.
          </div>
          <h1>
            Good friends.
            <br />
            <span className="serifish">Questionable</span>
            <br />
            answers<span className="orange">.</span>
          </h1>
          <p className="hero-description">
            Trivia. Party votes. Unofficial awards. Grab a phone and find out
            whose confidence has been writing checks their brain cannot cash.
          </p>
          <div className="hero-actions">
            <button
              className="button primary large"
              disabled={busy || !connected}
              onClick={() => run(create)}
            >
              Host a game <Arrow />
            </button>
            <a className="text-link" href="/tv">
              Open TV screen <Arrow diagonal />
            </a>
          </div>
          <div className="hero-facts">
            <span>2–8 players</span>
            <span>No phone app</span>
            <span>Just your home Wi-Fi</span>
          </div>
        </section>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="art-spark">✳</span>
          <span className="art-spark small-spark">✧</span>
          <div className="ticket-back">
            <span>YOU’RE INVITED</span>
            <span>FRIENDS • SNACKS • BRAGGING RIGHTS</span>
          </div>
          <div className="sample-card">
            <div className="sample-top">
              <span>THE IMPORTANT QUESTIONS</span>
              <span>01 / 10</span>
            </div>
            <span className="sample-icon">↗</span>
            <h2>
              Who’s really
              <br />
              here for
              <br />
              the snacks?
            </h2>
            <div className="sample-answer">
              <span>A</span> All of us. <b>✓</b>
            </div>
            <div className="sample-bottom">
              <span>GREAT MINDS. SAME ANSWER.</span>
              <span>✳</span>
            </div>
          </div>
          <div className="round-sticker">
            <span>BRING YOUR</span>
            <b>A-GAME</b>
            <span>OR JUST YOUR PHONE</span>
          </div>
          <div className="floating-avatar a-one">🐸</div>
          <div className="floating-avatar a-two">🦊</div>
        </div>
      </div>
      <section className="join-strip" aria-label="Join an existing room">
        <div>
          <span className="eyebrow">GOT AN INVITE?</span>
          <h2>Your seat is waiting.</h2>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            go("/join?room=" + roomCode.toUpperCase());
          }}
        >
          <label className="sr-only" htmlFor="quick-code">
            Room code
          </label>
          <input
            id="quick-code"
            name="code"
            className="code-input"
            placeholder="ROOM CODE"
            maxLength={4}
            minLength={4}
            pattern="[A-Za-z]{4}"
            required
            autoCapitalize="characters"
            autoComplete="off"
            value={roomCode}
            onChange={(e) =>
              setRoomCode(e.target.value.replace(/[^a-z]/gi, "").toUpperCase())
            }
          />
          <button className="button cream" type="submit">
            Join the fun <Arrow />
          </button>
        </form>
      </section>
      <section className="mode-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE LINEUP</span>
            <h2>What’s the mood tonight?</h2>
          </div>
          <span className="muted">Pick your game. We’ll handle the rest.</span>
        </div>
        <div className="mode-grid">
          {Object.entries(modes).map(([key, item], i) => (
            <button
              type="button"
              className={
                "mode-card " + item.color + (mode === key ? " selected" : "")
              }
              aria-pressed={mode === key}
              key={key}
              onClick={() => setMode(key)}
            >
              <div className="mode-top">
                <span className="mode-icon">{item.icon}</span>
                <span className="mode-number">0{i + 1}</span>
              </div>
              <span className="eyebrow">{item.tag}</span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <div className="mode-bottom">
                <span>
                  {mode === key ? "Selected for your room" : "Choose this game"}
                </span>
                <span>{mode === key ? "✓" : "↗"}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="how-to" id="how-to">
        <span className="eyebrow">FROM COUCH TO COMPETITION</span>
        <h2>Three steps. Zero homework.</h2>
        <div className="steps">
          <div>
            <b>01</b>
            <h3>Make a room</h3>
            <p>One person hosts on a phone or this PC.</p>
          </div>
          <div>
            <b>02</b>
            <h3>Get everyone in</h3>
            <p>Scan the QR code with each phone. Use the same home Wi-Fi.</p>
          </div>
          <div>
            <b>03</b>
            <h3>Let the games begin</h3>
            <p>
              Use your phones to play. Add the TV for the big-screen reveal.
            </p>
          </div>
        </div>
        <details>
          <summary>Using an Amazon Fire TV?</summary>
          <p>
            Open Amazon Silk on the Fire TV. Enter{" "}
            <strong>{config?.baseUrl || "the PC’s local address"}/tv</strong>,
            then enter the room code. The TV shows the game. Each person answers
            on their phone. You can also play using only phones.
          </p>
          <p>
            Keep the PC on and awake. Use the same home network, not a guest
            network. The game’s questions and fonts are stored on this PC.
          </p>
        </details>
      </section>
    </>
  );
}

function EntryForm({ tv, initialCode, run, busy }) {
  const [code, setCode] = useState(initialCode || "");
  const [name, setName] = useState(read("name") || "");
  const [avatar, setAvatar] = useState(Number(read("avatar") || 0));
  const saved = read("player:" + code);
  async function submit(e) {
    e.preventDefault();
    if (tv) return go("/tv/" + code);
    await run(async () => {
      const result = await call("room:join", { code, name, avatar });
      write("player:" + result.code, result.playerToken);
      write("name", name.trim());
      write("avatar", String(avatar));
      go("/play/" + result.code);
    });
  }
  return (
    <section className="entry-wrap">
      <div className="entry-illustration" aria-hidden="true">
        {tv ? "▣" : "✳"}
      </div>
      <span className="eyebrow">
        {tv ? "THE BEST SEAT IN THE HOUSE" : "YOU HAD US AT GAME NIGHT"}
      </span>
      <h1>{tv ? "Put it on the big screen." : "Pull up a seat."}</h1>
      <p className="muted">
        {tv
          ? "Enter the code from the host’s screen. Your friends play on their phones."
          : "Same Wi-Fi. Your own phone. One very good night."}
      </p>
      <form className="entry-card" onSubmit={submit}>
        <label htmlFor="room-code">Room code</label>
        <input
          id="room-code"
          className="code-input"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          placeholder="ABCD"
          maxLength={4}
          minLength={4}
          pattern="[A-Za-z]{4}"
          required
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/[^a-z]/gi, "").toUpperCase())
          }
        />
        {!tv && (
          <>
            <label htmlFor="player-name">What should we call you?</label>
            <input
              id="player-name"
              autoComplete="nickname"
              autoCorrect="off"
              placeholder="Your name"
              maxLength={18}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label>Pick your game face</label>
            <div
              className="avatar-picker"
              role="group"
              aria-label="Choose an avatar"
            >
              {avatars.map((face, i) => (
                <button
                  key={i}
                  className={avatar === i ? "chosen" : ""}
                  type="button"
                  aria-pressed={avatar === i}
                  aria-label={avatarNames[i]}
                  onClick={() => setAvatar(i)}
                >
                  {face}
                </button>
              ))}
            </div>
          </>
        )}
        <button
          className="button primary large full"
          type="submit"
          disabled={busy || (!tv && !name.trim())}
        >
          {tv ? "Show the room" : "I’m in"} <Arrow />
        </button>
        {!tv && saved && (
          <a className="resume-link" href={"/play/" + code}>
            Already joined? Return to your seat <Arrow />
          </a>
        )}
      </form>
      <p className="fine-print">No account. No app. Just show up.</p>
    </section>
  );
}

function JoinPanel({ state, config }) {
  return (
    <aside className="join-panel">
      <span className="eyebrow">THE GANG’S ALMOST HERE</span>
      <h2>Scan. Join. Play.</h2>
      <div className="qr-frame">
        <img
          width="220"
          height="220"
          src={"/api/qr?room=" + state.code}
          alt={"QR code to join room " + state.code}
        />
      </div>
      <span className="small-label">ROOM CODE</span>
      <div className="big-code">{state.code}</div>
      <p>
        On the same home Wi-Fi?
        <br />
        Open this address on your phone:
      </p>
      <a
        className="local-url"
        href={config?.baseUrl + "/join?room=" + state.code}
      >
        {config?.baseUrl?.replace("http://", "")}
      </a>
      <div className="join-note">
        Your phone is your controller.
        <br />
        No download needed.
      </div>
    </aside>
  );
}

function Players({ players, remove, lobby = false, compact = false }) {
  return (
    <div className={"player-grid" + (compact ? " compact" : "")}>
      {players.map((p) => (
        <div
          key={p.id}
          className={"player-tile" + (!p.connected ? " offline" : "")}
        >
          <Avatar value={p.avatar} small={compact} />
          <div className="player-info">
            <strong>{p.name}</strong>
            <span>
              {lobby
                ? p.connected
                  ? "Ready to play"
                  : "Reconnecting…"
                : p.score.toLocaleString() +
                  " pts · " +
                  (p.titles?.length || 0) +
                  " awards"}
            </span>
          </div>
          {lobby && remove && (
            <button
              className="remove-player"
              aria-label={"Remove " + p.name}
              title={"Remove " + p.name}
              onClick={() => remove(p.id)}
            >
              ×
            </button>
          )}
          {!lobby && (
            <span
              className={"answer-dot" + (p.answered ? " done" : "")}
              aria-label={p.answered ? "Answered" : "Waiting"}
            >
              {p.answered ? "✓" : "·"}
            </span>
          )}
        </div>
      ))}
      {lobby &&
        Array.from({ length: Math.max(0, 6 - players.length) }, (_, i) => (
          <div className="player-tile empty" key={"empty-" + i}>
            <span className="empty-avatar">+</span>
            <span>Open seat</span>
          </div>
        ))}
    </div>
  );
}

function Settings({ state, onChange, busy, categories = [] }) {
  const settings = state.settings;
  const change = (field, value) => onChange({ ...settings, [field]: value });
  return (
    <div className="settings">
      <div className="setting-label">TONIGHT’S GAME</div>
      <div className="mode-switch" role="group" aria-label="Game mode">
        {Object.entries(modes).map(([key, mode]) => (
          <button
            type="button"
            key={key}
            aria-pressed={settings.mode === key}
            className={settings.mode === key ? "active" : ""}
            disabled={busy}
            onClick={() => change("mode", key)}
          >
            <span>{mode.icon}</span> {mode.short}
          </button>
        ))}
      </div>
      <p className="setting-description">{modes[settings.mode].description}</p>
      <div className="settings-row">
        <label>
          Rounds
          <select
            aria-label="Rounds"
            value={settings.rounds}
            disabled={busy}
            onChange={(e) => change("rounds", Number(e.target.value))}
          >
            <option value={6}>6 · Quick game</option>
            <option value={10}>10 · Just right</option>
            <option value={16}>16 · Settle in</option>
          </select>
        </label>
        <label>
          Time to answer
          <select
            aria-label="Time to answer"
            value={settings.seconds}
            disabled={busy}
            onChange={(e) => change("seconds", Number(e.target.value))}
          >
            <option value={15}>15 seconds</option>
            <option value={25}>25 seconds</option>
            <option value={40}>40 seconds</option>
          </select>
        </label>
      </div>
      {settings.mode !== "party" && (
        <div className="category-section">
          <div className="setting-label">
            TRIVIA CATEGORIES · PICK AT LEAST ONE
          </div>
          <div className="category-chips">
            {categories.map((c) => (
              <button
                type="button"
                key={c}
                disabled={
                  busy ||
                  (settings.categories.length === 1 &&
                    settings.categories.includes(c))
                }
                aria-pressed={settings.categories.includes(c)}
                className={settings.categories.includes(c) ? "selected" : ""}
                onClick={() =>
                  change(
                    "categories",
                    settings.categories.includes(c)
                      ? settings.categories.filter((s) => s !== c)
                      : [...settings.categories, c],
                  )
                }
              >
                {settings.categories.includes(c) ? "✓ " : "+ "}
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="check-label">
        <input
          type="checkbox"
          disabled={busy}
          checked={settings.autoAdvance}
          onChange={(e) => change("autoAdvance", e.target.checked)}
        />
        <span>
          Keep the game moving
          <small>Start the next round 12 seconds after each reveal.</small>
        </span>
      </label>
    </div>
  );
}

function Lobby({
  state,
  config,
  role,
  isHost,
  hostAction,
  setSettings,
  remove,
  busy,
}) {
  const connectedCount = state.players.filter((p) => p.connected).length;
  if (role === "player" && !isHost)
    return (
      <section className="player-lobby">
        <Avatar value={state.me.avatar} />
        <Pill tone="lime">YOU’RE IN</Pill>
        <h1>Hey, {state.me.name}.</h1>
        <p className="muted">
          Get comfortable. The host will start when everyone’s here.
        </p>
        <div className="waiting-card">
          <span className="pulse-star">✳</span>
          <div>
            <span className="eyebrow">UP NEXT</span>
            <h2>{modes[state.settings.mode].name}</h2>
            <p>
              {state.settings.rounds} rounds · {state.settings.seconds} seconds
              to answer
            </p>
          </div>
        </div>
        <div className="section-heading">
          <h3>The good company</h3>
          <Pill>
            {connectedCount} / {state.maxPlayers || 8} ready
          </Pill>
        </div>
        <Players players={state.players} lobby />
        <p className="fine-print">
          Keep this page open. Your answer stays private until the reveal.
        </p>
      </section>
    );
  return (
    <div className="lobby-layout">
      <section className="lobby-main">
        <div className="eyebrow">
          <span className="status-dot" /> ROOM {state.code} IS OPEN
        </div>
        <h1>
          {role === "tv" ? "Everybody in?" : "Your living room.\nYour rules."}
        </h1>
        <p className="muted">
          {role === "tv"
            ? "Scan the code, pick a name, and grab a seat."
            : "Invite your people. Set the mood. Let the friendly rivalry begin."}
        </p>
        <div className="section-heading players-heading">
          <h2>The good company</h2>
          <Pill>
            {connectedCount} / {state.maxPlayers || 8} ready
          </Pill>
        </div>
        <Players
          players={state.players}
          remove={isHost ? remove : null}
          lobby
        />
        {isHost ? (
          <>
            <Settings
              state={state}
              onChange={setSettings}
              busy={busy}
              categories={config?.categories}
            />
            {!state.me && (
              <div className="waiting-for-host">
                <div>
                  <h3>The host can play too.</h3>
                  <p>
                    Choose your name before starting. This phone will show your
                    answers and the host controls.
                  </p>
                  <a
                    className="button primary large"
                    href={"/join?room=" + state.code}
                  >
                    Join &amp; play <Arrow />
                  </a>
                </div>
              </div>
            )}
            <div className="start-row">
              <button
                className={"button large " + (state.me ? "primary" : "outline")}
                disabled={busy || connectedCount < 2}
                onClick={() => hostAction("start")}
              >
                {state.me ? "Let’s play" : "Start without playing"} <Arrow />
              </button>
              <p>
                {connectedCount < 2
                  ? "Waiting for at least 2 players…"
                  : connectedCount + " players ready. Everyone in?"}
              </p>
            </div>
            <div className="host-links">
              <a href={"/join?room=" + state.code}>
                Play on this device <Arrow />
              </a>
              <a
                href={(config?.baseUrl || "") + "/tv/" + state.code}
                target="_blank"
                rel="noreferrer"
              >
                Open the TV view <Arrow diagonal />
              </a>
            </div>
          </>
        ) : (
          <div className="waiting-for-host">
            <span className="pulse-star">✳</span>
            <div>
              <h2>{modes[state.settings.mode].name}</h2>
              <p>
                {state.settings.rounds} rounds · Waiting for the host to start
              </p>
            </div>
          </div>
        )}
      </section>
      <JoinPanel state={state} config={config} />
    </div>
  );
}

function Timer({ state, offset }) {
  const [time, setTime] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  const remaining = state.paused
    ? state.round.remainingMs
    : state.round.deadline - (time + offset);
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const duration = state.phase === "question" ? state.settings.seconds : 12;
  const percent = Math.max(0, Math.min(100, (seconds / duration) * 100));
  const manual = state.phase === "reveal" && !state.settings.autoAdvance;
  return (
    <div className={"timer" + (seconds <= 5 && !manual ? " urgent" : "")}>
      <div className="timer-copy">
        <span>
          {state.paused
            ? "PAUSED"
            : manual
              ? "TAKE IT IN"
              : state.phase === "reveal"
                ? "NEXT ROUND"
                : "MAKE YOUR CALL"}
        </span>
        <b
          aria-label={state.paused ? "Timer paused" : seconds + " seconds left"}
        >
          {state.paused ? "Ⅱ" : manual ? "∞" : seconds + "s"}
        </b>
      </div>
      <div className="timer-track">
        <div style={{ width: (manual ? 100 : percent) + "%" }} />
      </div>
    </div>
  );
}

function HostControls({ state, hostAction, busy }) {
  return (
    <div className="host-controls">
      <span className="eyebrow">HOST CONTROLS</span>
      <div>
        <button
          className="button outline"
          disabled={busy}
          onClick={() => hostAction("pause")}
        >
          {state.paused ? "Resume" : "Pause"}
        </button>
        {state.phase === "question" ? (
          <button
            className="button outline"
            disabled={busy}
            onClick={() => hostAction("reveal")}
          >
            Close answers
          </button>
        ) : (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => hostAction("next")}
          >
            {state.roundNumber === state.settings.rounds
              ? state.settings.mode === "trivia"
                ? "Final scores"
                : "Awards & scores"
              : "Next round"}{" "}
            <Arrow />
          </button>
        )}
      </div>
    </div>
  );
}

function Round({ state, role, isHost, answer, hostAction, busy, offset }) {
  const round = state.round;
  const result = round.result;
  const playing = role === "player";
  const selected = state.me?.answer;
  const opinion = ["award", "poll"].includes(round.kind);
  const isAward = round.kind === "award";
  const points = result && playing ? result.awards[state.me.id] : null;
  const winners = result
    ? round.options.filter((o) => result.winningIds.includes(o.id))
    : [];
  return (
    <section
      className={
        "round-view " +
        (playing ? "phone-round" : "display-round") +
        (round.playerVote ? " roast-round" : "")
      }
    >
      <div className="round-top">
        <div className="round-pills">
          <Pill tone={opinion ? "lavender" : "lime"}>
            {opinion
              ? isAward
                ? "★ FRIENDSHIP AWARD"
                : "↗ GROUP VOTE"
              : round.playerVote
                ? "↗ ROAST THE ROOM"
                : opinion
                  ? "↗ GROUP VOTE"
                  : "? TRIVIA"}
          </Pill>
          <span className="eyebrow">
            ROUND {state.roundNumber} / {state.settings.rounds}
          </span>
        </div>
        <span className="round-score">
          {playing
            ? state.settings.mode === "party"
              ? (state.me.titles?.length || 0) + " AWARDS"
              : state.me.score.toLocaleString() + " PTS"
            : round.category}
        </span>
      </div>
      <Timer state={state} offset={offset} />
      {state.paused && (
        <div className="pause-banner" role="status">
          Snack break. The host has paused the game.
        </div>
      )}
      <div className="question-block">
        <span className="eyebrow">
          {opinion
            ? isAward
              ? "FICTIONAL SITUATION · PICK A FRIEND · NO RIGHT ANSWER"
              : "PICK YOUR FAVORITE · NO RIGHT ANSWER"
            : round.playerVote
              ? "PICK A FRIEND · SELF-VOTES ALLOWED"
              : opinion
                ? "NO RIGHT ANSWER · NO POINTS"
                : round.category.toUpperCase() + " · 1,000 POINTS"}
        </span>
        <h1>{round.question}</h1>
      </div>
      <div className="answer-grid">
        {round.options.map((option, i) => {
          const won = result?.winningIds.includes(option.id);
          const picked = selected === option.id;
          const classes = [
            "answer-option",
            "option-" + i,
            picked ? "picked" : "",
            result
              ? won
                ? opinion
                  ? "vote-leader"
                  : "correct"
                : "dimmed"
              : "",
          ]
            .filter(Boolean)
            .join(" ");
          const inner = (
            <>
              <span className="answer-letter">{letters[i]}</span>
              <span className="answer-text">{option.label}</span>
              {result ? (
                <span className="answer-count">
                  {opinion
                    ? result.counts[option.id] +
                      (result.counts[option.id] === 1 ? " vote" : " votes")
                    : won
                      ? "✓"
                      : ""}
                  {picked && <small>Your pick</small>}
                </span>
              ) : picked ? (
                <span className="picked-mark">✓</span>
              ) : null}
            </>
          );
          return playing ? (
            <button
              key={option.id}
              className={classes}
              disabled={
                busy ||
                state.paused ||
                state.phase !== "question" ||
                selected !== null
              }
              aria-label={letters[i] + ": " + option.label}
              aria-pressed={picked}
              onClick={() => answer(option.id)}
            >
              {inner}
            </button>
          ) : (
            <div className={classes} key={option.id}>
              {inner}
            </div>
          );
        })}
      </div>
      {result ? (
        <div
          className={"reveal-card" + (points > 0 ? " earned" : "")}
          role="status"
        >
          <div className="reveal-mark">
            {opinion
              ? isAward
                ? "★"
                : "↗"
              : playing
                ? points > 0
                  ? "+" + points.toLocaleString()
                  : selected === null
                    ? "⌛"
                    : "↗"
                : "✳"}
          </div>
          <div>
            <h2>
              {opinion
                ? winners.length === 0
                  ? "The room went quiet."
                  : isAward
                    ? winners.map((o) => o.label.split(" ")[0]).join(" & ") +
                      (winners.length > 1
                        ? " share the award."
                        : " takes the award.")
                    : winners.length > 1
                      ? "A split decision!"
                      : "The room has spoken."
                : playing
                  ? points > 0
                    ? "Annoyingly well played."
                    : selected === null
                      ? "Time got away from you."
                      : opinion
                        ? "You went your own way."
                        : "Confidence: legendary. Accuracy: grey pistol."
                  : opinion
                    ? winners.length > 1
                      ? "A split decision!"
                      : winners.length === 0
                        ? "The room went quiet."
                        : round.playerVote
                          ? winners[0].label + ", the group has notes."
                          : "The room has spoken."
                    : "The answer is " + winners[0]?.label + "."}
            </h2>
            {isAward && winners.length > 0 && (
              <strong className="award-title">{result.title}</strong>
            )}
            <p>{result.explanation}</p>
            {opinion && (
              <small className="opinion-note">
                {isAward ? "Most votes earns the title. Ties share it. " : ""}
                Opinions do not earn points.
              </small>
            )}
            {result.source && (
              <a
                className="fact-source"
                href={result.source}
                target="_blank"
                rel="noreferrer"
              >
                Check this fact ↗
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="answer-status" role="status">
          <span className="status-dot" />
          <span>
            {playing && selected !== null
              ? opinion
                ? "Vote locked. Your choice stays secret until the reveal."
                : "Answer locked. Watch the reveal."
              : playing
                ? opinion
                  ? "Tap a name or choice to lock in your vote."
                  : "Tap once to lock in your answer."
                : opinion
                  ? "Vote on your phone. Self-votes are allowed."
                  : "Choose your answer on your phone."}
          </span>
          <b>
            {round.answeredCount} / {round.expectedCount} in
          </b>
        </div>
      )}
      {!playing && (
        <div className="round-players">
          <Players players={state.players} compact />
        </div>
      )}
      {isHost && (
        <HostControls state={state} hostAction={hostAction} busy={busy} />
      )}
      {playing && (
        <details className="phone-leaderboard">
          <summary>
            {state.settings.mode === "trivia"
              ? "See the scores"
              : "See awards & scores"}
          </summary>
          {state.settings.mode !== "trivia" ? (
            <AwardCabinet
              players={state.players}
              showPoints={state.settings.mode === "mix"}
            />
          ) : (
            <Leaderboard players={state.players} me={state.me?.id} />
          )}
        </details>
      )}
    </section>
  );
}

function Leaderboard({ players, me }) {
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
  return (
    <ol className="leaderboard">
      {sorted.map((p, i) => (
        <li key={p.id} className={p.id === me ? "is-me" : ""}>
          <span className="rank">
            {sorted.findIndex((other) => other.score === p.score) + 1}
          </span>
          <Avatar value={p.avatar} small />
          <strong>
            {p.name}
            {p.id === me && <small>YOU</small>}
          </strong>
          <b>
            {p.score.toLocaleString()}
            <small>PTS</small>
          </b>
        </li>
      ))}
    </ol>
  );
}

function Finished({ state, isHost, hostAction, busy }) {
  if (state.settings.mode !== "trivia")
    return <PartyFinished {...{ state, isHost, hostAction, busy }} />;
  const high = Math.max(...state.players.map((p) => p.score));
  const winners = state.players.filter((p) => p.score === high);
  return (
    <section className="finished">
      <div className="celebration" aria-hidden="true">
        <span>✦</span>
        <span>✳</span>
        <span>✦</span>
      </div>
      <Pill tone="lime">THE BRAGGING RIGHTS ARE OFFICIAL</Pill>
      <h1>
        {high === 0
          ? "A night to remember."
          : winners.length === 1
            ? winners[0].name + " takes the crown."
            : "Great minds. Shared crown."}
      </h1>
      <p className="muted">
        {high === 0
          ? "The snacks were the real winners."
          : winners.map((p) => p.name).join(" & ") +
            " · " +
            high.toLocaleString() +
            " points"}
      </p>
      <div className="winner-faces">
        {winners.map((p) => (
          <Avatar value={p.avatar} key={p.id} />
        ))}
      </div>
      <Leaderboard players={state.players} me={state.me?.id} />
      {isHost ? (
        <button
          className="button primary large"
          disabled={busy}
          onClick={() => hostAction("lobby")}
        >
          One more game? <Arrow />
        </button>
      ) : (
        <div className="waiting-for-rematch">
          Ready for a rematch? The host can start another game.
        </div>
      )}
      <p className="fine-print">
        Same people. Clean scoreboard. New bragging rights.
      </p>
    </section>
  );
}

function App() {
  const [inviteError] = useState(() => {
    // A private host invite keeps its capability in the URL fragment, so it is
    // never sent to the HTTP server, QR code, TV, or another player's view.
    if (window.location.pathname !== "/join") return "";
    const invite = new URLSearchParams(window.location.hash.slice(1)).get(
      "host",
    );
    const room = new URLSearchParams(window.location.search)
      .get("room")
      ?.toUpperCase();
    if (
      !invite ||
      !/^[a-f0-9]{48}$/.test(invite) ||
      !/^[A-Z]{4}$/.test(room || "")
    )
      return "";
    try {
      write("host:" + room, invite);
      write("lastHost", room);
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      return "";
    } catch (error) {
      return error.message;
    }
  });
  const parts = window.location.pathname.split("/").filter(Boolean);
  const route = parts[0] || "home";
  const code = (parts[1] || "").toUpperCase();
  const role =
    route === "host"
      ? read("player:" + code)
        ? "player"
        : "host"
      : route === "play"
        ? "player"
        : route === "tv" && code
          ? "tv"
          : null;
  const secret =
    role === "host"
      ? read("host:" + code)
      : role === "player"
        ? read("player:" + code)
        : null;
  const hostToken = read("host:" + code);
  const isHost = Boolean(hostToken && (role === "host" || role === "player"));
  const [state, setState] = useState(null);
  const [config, setConfig] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(inviteError);
  const [fatal, setFatal] = useState("");
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  function receive(next) {
    setState(next);
    setOffset(next.serverTime - Date.now());
    setFatal("");
  }
  async function run(fn) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setError("Could not reach the PC. Check the connection."));
    function onConnect() {
      setConnected(true);
      setError("");
      if (role) {
        if (role !== "tv" && !secret) {
          setFatal(
            role === "host"
              ? "Host controls are saved in the browser that created this room. Use that browser, or open the TV view."
              : "Choose a name to join this room.",
          );
          return;
        }
        call("room:attach", { code, role, secret })
          .then((r) => receive(r.state))
          .catch((e) => setFatal(e.message));
      }
    }
    const onDisconnect = () => setConnected(false);
    const onClosed = (data) => {
      setState(null);
      setFatal(data.message);
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    socket.on("room:state", receive);
    socket.on("room:closed", onClosed);
    socket.connect();
    // Retry on focus: iOS may suspend a background tab and miss the first reconnect event.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (socket.connected) onConnect();
        else socket.connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onDisconnect);
      socket.off("room:state", receive);
      socket.off("room:closed", onClosed);
      socket.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  useEffect(() => {
    let lock;
    async function wake() {
      if (
        role &&
        document.visibilityState === "visible" &&
        "wakeLock" in navigator
      ) {
        try {
          lock = await navigator.wakeLock.request("screen");
        } catch {
          /* HTTP on a LAN may not offer wake lock. */
        }
      }
    }
    wake();
    document.addEventListener("visibilitychange", wake);
    return () => {
      lock?.release();
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  const hostAction = (action) =>
    run(() => call("host:action", { hostToken, action }));
  const setSettings = (settings) =>
    run(async () => {
      const previous = state.settings;
      setState((current) => ({ ...current, settings }));
      try {
        await call("room:settings", { hostToken, settings });
      } catch (error) {
        setState((current) => ({ ...current, settings: previous }));
        throw error;
      }
    });
  const remove = (playerId) =>
    run(() => call("host:remove", { hostToken, playerId }));
  const answer = (choiceId) =>
    run(() => call("player:answer", { roundId: state.round.id, choiceId }));
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreen(Boolean(document.fullscreenElement));
    } catch {
      setError("Use your browser’s full-screen option if available.");
    }
  }
  return (
    <div className={"app route-" + route + (role === "tv" ? " tv" : "")}>
      <header>
        <Brand />
        <nav>
          {state ? (
            <>
              <span className="nav-room">
                ROOM <b>{state.code}</b>
              </span>
              {role === "player" ? (
                <span className="nav-player">
                  {avatars[state.me?.avatar || 0]} {state.me?.name}
                </span>
              ) : (
                <button
                  className="text-link fullscreen"
                  onClick={toggleFullscreen}
                >
                  {fullscreen ? "Exit full screen" : "Full screen"}{" "}
                  <span aria-hidden="true">⛶</span>
                </button>
              )}
            </>
          ) : (
            <>
              <a className="text-link" href="/#how-to">
                How to play
              </a>
              <a className="button outline small-button" href="/join">
                Join a room <Arrow />
              </a>
            </>
          )}
        </nav>
      </header>
      {!connected && (
        <div className="connection-banner" role="status">
          Connecting to the PC… Keep the PC on and use the same home Wi-Fi.
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <main>
        {fatal ? (
          <section className="entry-wrap">
            <span className="entry-illustration">↗</span>
            <h1>Let’s get you back in.</h1>
            <p>{fatal}</p>
            <div className="recovery-actions">
              <a className="button primary" href={"/join?room=" + code}>
                Join the room <Arrow />
              </a>
              <a className="button outline" href="/">
                Home
              </a>
              {role === "host" && (
                <a className="text-link" href={"/tv/" + code}>
                  Open the TV view
                </a>
              )}
            </div>
          </section>
        ) : state ? (
          state.phase === "lobby" ? (
            <Lobby
              {...{
                state,
                config,
                role,
                isHost,
                hostAction,
                setSettings,
                remove,
                busy,
              }}
            />
          ) : state.phase === "finished" ? (
            <Finished {...{ state, isHost, hostAction, busy }} />
          ) : (
            <Round
              {...{ state, role, isHost, answer, hostAction, busy, offset }}
            />
          )
        ) : role ? (
          <div className="loading">
            <span className="pulse-star">✳</span>
            <p>Finding your room…</p>
          </div>
        ) : route === "join" || route === "tv" ? (
          <EntryForm
            tv={route === "tv"}
            initialCode={new URLSearchParams(location.search)
              .get("room")
              ?.toUpperCase()}
            {...{ run, busy }}
          />
        ) : (
          <Home {...{ run, busy, connected, config }} />
        )}
      </main>
      {!role && <Footer />}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
