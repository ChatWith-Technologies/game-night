# Security and privacy

Game Night is intended for a trusted home network. Run it on a computer you control. Do not forward its port to the internet or place it behind a public tunnel. It uses local HTTP, not encrypted HTTPS, and does not provide accounts or internet-service security.

The server accepts private IPv4 and loopback connections and checks request hostnames and browser origins. These checks limit accidental exposure; they do not replace a firewall or make an untrusted network safe.

Room codes let people on that network join or watch a room. They are not passwords. Host and player controls use separate random tokens. Tokens stay in each browser's local storage. The public TV display receives no host token, player token, correct answer before reveal, or other player's selected answer.

The server keeps names, votes, scores, and rooms in memory. A restart clears them. Inactive rooms expire after six hours. Player names and vote totals are shown to the room. Individual votes stay private from other players; the computer running the server can inspect its own memory and source. This is a social game, not an anti-cheat system.

There are no ads, analytics, account services, AI calls, or remote font requests. Initial installation needs internet access. Playing does not. Links to fact sources open only when someone chooses them.

## Reporting a problem

Use the repository's **Security → Report a vulnerability** page for sensitive reports if it is available. Do not put passwords, private URLs, personal information, or working exploit details in a public issue. General fixes and non-sensitive bug reports can use GitHub Issues.

Only the latest release is maintained.
