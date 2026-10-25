# Contributing

Small improvements are welcome: better questions, clearer instructions, device fixes, or new local game modes.

1. Fork the repository and create a branch.
2. Install Node.js 24, then run `npm ci`.
3. Run `npm run dev` for development, or `npm run build` followed by `npm start`.
4. Run `npm run check` before opening a pull request. For screen changes, also run the browser tests below.
5. Explain the problem, what changed, and what you tested.

## Browser tests

Use Python 3.11 or newer:

```sh
python -m pip install -r tests/requirements.txt
python -m playwright install chromium webkit
npm run build
npm run test:browser
```

On Linux, use `python -m playwright install --with-deps chromium webkit`. The tests start their own temporary server and stop it on exit. They use isolated browser sessions, not personal browser profiles. Reports and screenshots go to the ignored `test-results/` directory.

## Content rules

- Keep correct trivia answers on the server. Add a reliable source or a note in `CONTENT-NOTES.md` for facts that need context.
- Keep qualifiers such as league, year, and game mode in the question.
- Opinions must not earn trivia points. Party awards are fictional jokes based on the current room's votes.
- Do not add private stories, personal profiles, real player names, device addresses, passwords, API keys, or copied commercial question packs.
- Keep the game usable without an account, API key, or external service.

## Project map

- `src/`: phone, host, and TV screens.
- `server/game.js`: rooms, timers, scoring, and private player state.
- `server/content.js`, `server/house-content.js`: trivia and topic packs.
- `server/party-content.js`: awards and group polls.
- `server/index.js`: local web server, QR codes, and live connections.
- `tests/`: engine, network, and browser checks.

Build a release with `npm run check`, `npm run test:browser`, then `npm run package`. The release script uses an explicit file list and does not include local settings, runtime files, or saved rooms.

By contributing, you agree that your contribution may be distributed under the project's MIT license.
