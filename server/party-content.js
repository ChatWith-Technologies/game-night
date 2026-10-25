import { houseVotes, houseRoasts } from "./house-content.js";
const chaosRows = [
  [
    "Who would loot for twelve minutes, die instantly, and blame everyone else's landing spot?",
    "Loot Goblin Emeritus",
    "Inventory: excellent. Position: eliminated.",
  ],
  [
    "Who would ask for a reboot while the rest of us are actively fighting for our lives?",
    "Reboot Customer Support",
    "Your request is important to us. Please remain deceased.",
  ],
  [
    "Who would hire a Fortnite coach and then argue with the coach?",
    "Uncoachable Investment",
    "Money was spent. No lessons were learned.",
  ],
  [
    "Who would see one dinosaur and say 'I could probably take that'?",
    "Jurassic Overconfidence",
    "The fossil record disagrees.",
  ],
  [
    "Who would sell the Trojan Horse on Facebook Marketplace before opening it?",
    "Ancient Side Hustle",
    "Lightly used. Some assembly. Several Greeks included.",
  ],
  [
    "Who would bring a Bluetooth speaker to the moon and become humanity's first noise complaint?",
    "One Small Step, Full Volume",
    "A giant leap for playing the same song again.",
  ],
  [
    "Who would hear 'survival of the fittest' and immediately start flexing?",
    "Natural Selection Gym Bro",
    "Darwin has asked to be removed from this conversation.",
  ],
  [
    "Who would give Napoleon unsolicited advice about his strategy?",
    "Waterloo Assistant Coach",
    "The battlefield has been replaced with a whiteboard and confidence.",
  ],
  [
    "Who would try to cure a hangover by reading one science headline incorrectly?",
    "Peer-Reviewed Nonsense",
    "The study was on fruit flies. This has not slowed the presentation.",
  ],
  [
    "Who would miss the winning touchdown because they were explaining why the team would lose?",
    "Live Take, Instant Expiry",
    "A take so cold it arrived frozen.",
  ],
  [
    "Who would turn choosing a bar into a 45-minute parliamentary procedure?",
    "Speaker of the Group Chat",
    "The motion to leave the house has failed again.",
  ],
  [
    "Who would become best friends with the Uber driver before we reach the end of the street?",
    "Five-Star Social Director",
    "We now know his dog's name and have been invited to a barbecue.",
  ],
  [
    "Who would organize an after-party while still being late to the actual party?",
    "Future Plans, Current Absence",
    "Visionary leadership from an undisclosed couch.",
  ],
  [
    "Who would claim the aux, play one song, and then disappear?",
    "Aux and Run",
    "A musical hit-and-run. The chorus remains at the scene.",
  ],
  [
    "Who would confidently explain a movie they fell asleep through?",
    "REM Film Critic",
    "The plot was unclear. The nap was five stars.",
  ],
  [
    "Who would make a harmless board game feel like a Supreme Court hearing?",
    "Chief Justice of Uno",
    "The rulebook has been entered into evidence.",
  ],
  [
    "Who would accidentally become mayor while trying to complain about parking?",
    "Accidental Mayor",
    "Campaign platform: let me leave my car here.",
  ],
  [
    "Who would take the prize for 'most likely to win this award' far too seriously?",
    "Award About an Award",
    "A historic achievement in circular reasoning.",
  ],
  [
    "Who would survive an alien invasion by making the aliens too tired to argue?",
    "Diplomatic Exhaustion",
    "Earth is safe. The conversation is still ongoing.",
  ],
  [
    "Who would turn 'one quick drink' into a three-location historical tour?",
    "National Register of Bars",
    "Every stop has cultural significance according to the person ordering.",
  ],
];

const awardTitles = [
  "Optimistic Damage Report",
  "Loot Before Loyalty",
  "Offline Lag Expert",
  "Three-Part Night Out",
  "Roman Reboot Specialist",
  "Unsolicited Referee Coach",
  "One-Video Scientist",
  "Bagging Area Debater",
  "Flexible Time Zone",
  "Museum Side Quest",
  "Ergonomic Applicant",
  "Practice Shot Parade",
  "Apocalypse Commissioner",
  "Posthumous Team Briefing",
  "Minister of the Aux",
  "Accidental Parade Marshal",
  "Scenic Route Strategist",
  "One-Point Professor",
  "Storm Customer Support",
  "Speaker Conflict Manager",
  "Warm-Up Hall of Fame",
  "Group Chat Diplomat",
  "Couch Fashion Week",
  "Retroactive Genius",
];

export const partyAwards = [
  ...houseRoasts.map(([question, explanation], i) => ({
    id: `party-${i + 1}`,
    kind: "award",
    category: "Party awards",
    playerVote: true,
    question,
    explanation,
    choices: [],
    title: awardTitles[i],
  })),
  ...chaosRows.map(([question, title, explanation], i) => ({
    id: `chaos-${i + 1}`,
    kind: "award",
    category: "Party awards",
    playerVote: true,
    question,
    title,
    explanation,
    choices: [],
  })),
];
export const partyPolls = houseVotes.map(([question, ...choices], i) => ({
  id: `poll-${i + 1}`,
  kind: "poll",
  category: "Group vote",
  question,
  choices,
  explanation:
    "The room has spoken. These are opinions: no right answer and no trivia points.",
}));
