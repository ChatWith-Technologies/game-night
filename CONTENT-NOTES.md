# Content notes

The game includes 200 multiple-choice trivia questions, 60 Fact or Fiction statements, 44 party awards, and 24 group polls: 328 prompts in total. Questions and jokes are written for this project. Factual answers and fictional joke options are separate. Correct trivia and Fact or Fiction answers earn 1,000 points. Group polls and party awards have no right answer and never add trivia points. A player with the most votes receives that round's award; tied players share it. No drinking tasks are required to play.

The default trivia mix covers general knowledge, movies, music, science, and sports. Hosts can also choose Fortnite, history, geography, food, and After Hours. After Hours contains adult drink and nightlife references. Party awards also include some bar and hangover jokes. This is a social game for friends, not a classroom question bank.

Party prompts describe fictional situations. They do not make factual claims about the people in the room. Player names come only from the current players. No real people's profiles, private stories, or fixed friend list are included.

The Fortnite questions use established mechanics and dated launch facts rather than a changing season's loot pool. These primary sources informed the topic packs:

- [Epic: Battle Royale goes free in September 2017](https://www.fortnite.com/news/fortnite-battle-royale-goes-free?lang=en-US) — original 100-player pitch and launch timing.
- [Epic: Zero Build](https://www.fortnite.com/news/fortnite-zero-build-take-the-offensive-in-this-no-build-battle-royale) — no building and the recharging Overshield.
- [Epic: Boogie Bomb update](https://www.fortnite.com/news/boogie-bomb-update?lang=en-US) — original dancing effect.
- [Epic: v3.3 patch notes](https://www.fortnite.com/news/v3-3-patch-notes?lang=en-US) — Supply Llama.
- [Epic: v3.4 content update](https://www.fortnite.com/news/v3-4-content-update) — Epic purple and Legendary gold.
- [NFL: football terms](https://operations.nfl.com/rules-officiating/nfl-football-basics/football-terms) — scoring terms.
- [NBA: scoring and timing](https://official.nba.com/rule-no-5-scoring-and-timing/) — regulation quarters and shot values.
- [NASA: solar system facts](https://science.nasa.gov/solar-system/solar-system-facts/) — planets and the Sun.
- [National Archives: Constitution](https://www.archives.gov/milestone-documents/constitution) — Philadelphia and 1787.
- [National Archives: Declaration history](https://www.archives.gov/founding-docs/declaration-history) — adoption versus signing dates.
- [International Bartenders Association: cocktail list](https://iba-world.com/cocktails/) — named classic drinks.

Fact or Fiction uses a separate bank in `server/truth-content.js`. Each item has a direct source link, shown after the answer is revealed. False statements receive a correction. These sources were checked on October 24, 2026; the game stores the questions locally and does not fetch pages while playing. The mode covers six topics and does not use the multiple-choice category filter. Additional primary sources for this bank are:

- [NASA: Venus](https://science.nasa.gov/venus/venus-facts/), [the Moon](https://science.nasa.gov/moon/facts/), and [Saturn](https://science.nasa.gov/saturn/facts/) — rotation, moons, and planet properties.
- [National Weather Service: lightning myths](https://www.weather.gov/safety/lightning-myths) — repeated strikes and strikes outside rain.
- [USTA: tennis scoring](https://www.usta.com/en/home/improve/tips-and-instruction/national/tennis-scoring-rules.html) — standard game and advantage scoring.
- [National Archives: Bill of Rights](https://www.archives.gov/founding-docs/bill-of-rights) — the original proposal and the first ten amendments.
- [FIDE: Laws of Chess](https://handbook.fide.com/chapter/E012023) — standard pieces, promotion, checkmate, and castling.
- [NIST: metric prefixes](https://www.nist.gov/pml/owm/metric-si-prefixes) and [BIPM: SI base units](https://www.bipm.org/en/measurement-units/si-base-units) — measurement terms.

The bank is not a set of copied source questions. Reveals are intentionally short. A question with a date or rule context keeps that qualifier in its text. Review new facts when editing the bank, and keep correct answers on the server. Jokes in explanations are commentary, not extra conditions for a correct answer.
