import React from "react";
const faces = ["🐸", "🦊", "🐼", "🐙", "🦁", "🦄", "🦖", "🐧"];
export function AwardCabinet({ players, showPoints = false }) {
  return (
    <div className="award-cabinet">
      {players.map((p) => {
        const titles = p.titles || [];
        return (
          <article className="award-person" key={p.id}>
            <div className="award-person-heading">
              <span>{faces[p.avatar]}</span>
              <div>
                <h3>{p.name}</h3>
                <small>
                  {titles.length} {titles.length === 1 ? "award" : "awards"}
                  {showPoints
                    ? ` · ${p.score.toLocaleString()} trivia pts`
                    : ""}
                </small>
              </div>
            </div>
            {titles.length ? (
              <ul>
                {titles.slice(-2).map((item) => (
                  <li key={item.round}>
                    <b>★ {item.title}</b>
                    <span>
                      {item.votes} {item.votes === 1 ? "vote" : "votes"}
                      {item.tied ? " · shared award" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Suspiciously normal tonight.</p>
            )}
            {titles.length > 2 && (
              <details>
                <summary>{titles.length - 2} more awards</summary>
                <ul>
                  {titles.slice(0, -2).map((item) => (
                    <li key={item.round}>
                      <b>★ {item.title}</b>
                      <span>
                        {item.votes} votes{item.tied ? " · shared award" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function PartyFinished({ state, isHost, hostAction, busy }) {
  const mixed = state.settings.mode !== "party";
  const high = Math.max(...state.players.map((p) => p.score));
  const leaders = state.players
    .filter((p) => p.score === high)
    .map((p) => p.name.split(" ")[0]);
  return (
    <section className="party-finished">
      <span className="eyebrow">THE RESULTS ARE IN</span>
      <h1>The room has spoken.</h1>
      <p className="muted">
        {mixed
          ? high > 0
            ? `Trivia crown: ${leaders.join(" & ")} · ${high.toLocaleString()} points.`
            : "No trivia points this time. The snacks remain undefeated."
          : "These awards reflect tonight’s votes. There were no right or wrong opinions."}
      </p>
      <AwardCabinet players={state.players} showPoints={mixed} />
      {isHost ? (
        <button
          className="button primary large"
          disabled={busy}
          onClick={() => hostAction("lobby")}
        >
          One more game? →
        </button>
      ) : (
        <p className="fine-print">
          The host can start another game. New prompts. Fresh allegations.
        </p>
      )}
    </section>
  );
}
