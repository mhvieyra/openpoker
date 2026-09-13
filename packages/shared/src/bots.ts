export type BotArchetype =
  | "nit"
  | "tag"
  | "lag"
  | "maniac"
  | "calling-station"
  | "balanced";

export interface BotPersonality {
  archetype: BotArchetype;
  /** 0 = folds almost everything, 1 = plays nearly every hand */
  looseness: number;
  /** 0 = passive (checks/calls), 1 = aggressive (bets/raises) */
  aggression: number;
  /** 0 = never bluffs, 1 = bluffs often */
  bluffFrequency: number;
  /** multiplier on "thinking time" before acting, for realism */
  paceMultiplier: number;
}

export const BOT_ARCHETYPES: Record<BotArchetype, Omit<BotPersonality, "archetype">> = {
  nit: { looseness: 0.16, aggression: 0.3, bluffFrequency: 0.03, paceMultiplier: 1.1 },
  tag: { looseness: 0.24, aggression: 0.55, bluffFrequency: 0.08, paceMultiplier: 1.0 },
  lag: { looseness: 0.38, aggression: 0.7, bluffFrequency: 0.16, paceMultiplier: 0.85 },
  maniac: { looseness: 0.55, aggression: 0.85, bluffFrequency: 0.28, paceMultiplier: 0.6 },
  "calling-station": { looseness: 0.5, aggression: 0.15, bluffFrequency: 0.02, paceMultiplier: 1.2 },
  balanced: { looseness: 0.28, aggression: 0.5, bluffFrequency: 0.1, paceMultiplier: 1.0 },
};

// Realistic-looking handles: mix of first-name-ish roots, place names, leet-ish numbers and
// suffixes, in the style of real online poker usernames (lowercase, no spaces, trailing digits)
// as well as a smaller pool of "real name style" display names for variety.
const HANDLE_ROOTS = [
  "rota", "rafa", "osmi", "alter", "soul", "vova", "magel", "nogales", "kova", "drago",
  "silva", "ivanov", "fener", "tigran", "bulat", "cardoso", "moreno", "kessler", "orlov",
  "batista", "franco", "medina", "ruslan", "castro", "vargas", "romano", "duarte", "kimura",
  "alonso", "pereira", "grigor", "sokol", "lobato", "cazorla", "wenger", "torino", "escobar",
];

const HANDLE_SUFFIXES = [
  "ledo1", "recife96", "nog999", "tan", "vova", "gellan", "999", "72", "21", "rn",
  "prime", "x", "nyc", "official", "poker", "grind", "88", "007", "night", "az",
];

const REAL_NAME_STYLE = [
  "Al Magellan", "R00ber7", "Marco Steel", "J. Calloway", "Nadia Frost", "Sam Ortega",
  "Vik Petrov", "Lena Cross", "Theo Marsh", "Dana Wolfe", "Mika Reyes", "Owen Black",
  "Carla Vance", "Ezra Finch", "Nora Blake", "Ivo Santos", "Greta Lund", "Cole Ashby",
];

export interface BotIdentity {
  username: string;
  archetype: BotArchetype;
  avatarSeed: string;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

const ARCHETYPES = Object.keys(BOT_ARCHETYPES) as BotArchetype[];

/** Deterministic-ish bot identity generator; pass a numeric seed for reproducibility in tests. */
export function generateBotIdentity(seed: number, usedNames: Set<string>): BotIdentity {
  const rng = mulberry32(seed);
  let username: string;
  let attempts = 0;
  do {
    if (rng() < 0.25) {
      username = pick(REAL_NAME_STYLE, rng);
    } else {
      const root = pick(HANDLE_ROOTS, rng);
      const suffix = pick(HANDLE_SUFFIXES, rng);
      username = `${root}${suffix}`;
    }
    attempts += 1;
  } while (usedNames.has(username) && attempts < 50);

  usedNames.add(username);
  const archetype = pick(ARCHETYPES, rng);
  return {
    username,
    archetype,
    avatarSeed: `${username}-${seed}`,
  };
}

export function botPersonality(archetype: BotArchetype): BotPersonality {
  return { archetype, ...BOT_ARCHETYPES[archetype] };
}
