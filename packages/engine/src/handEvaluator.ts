import type { Card, Rank } from "./card.js";

export type HandCategory =
  | "high-card"
  | "pair"
  | "two-pair"
  | "three-of-a-kind"
  | "straight"
  | "flush"
  | "full-house"
  | "four-of-a-kind"
  | "straight-flush";

const CATEGORY_ORDER: HandCategory[] = [
  "high-card",
  "pair",
  "two-pair",
  "three-of-a-kind",
  "straight",
  "flush",
  "full-house",
  "four-of-a-kind",
  "straight-flush",
];

export interface HandScore {
  category: HandCategory;
  /** Comparable rank vector: [categoryIndex, tiebreak...]. Higher is better, lexicographic. */
  rank: number[];
  cards: Card[];
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  const withFirst = combinations(rest, size - 1).map((combo) => [first, ...combo]);
  const withoutFirst = combinations(rest, size);
  return [...withFirst, ...withoutFirst];
}

function evaluate5(cards: Card[]): HandScore {
  const ranksDesc = [...cards].map((c) => c.rank).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  const countByRank = new Map<Rank, number>();
  for (const r of ranksDesc) countByRank.set(r, (countByRank.get(r) ?? 0) + 1);

  // groups sorted by (count desc, rank desc)
  const groups = [...countByRank.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));

  // Straight detection (handles wheel A-2-3-4-5)
  const uniqueRanksDesc = [...new Set(ranksDesc)];
  let straightHigh: number | null = null;
  if (uniqueRanksDesc.length >= 5) {
    const withWheel = uniqueRanksDesc.includes(14)
      ? [...uniqueRanksDesc, 1]
      : uniqueRanksDesc;
    for (let i = 0; i <= withWheel.length - 5; i++) {
      const slice = withWheel.slice(i, i + 5);
      if (slice[0] - slice[4] === 4) {
        straightHigh = slice[0];
        break;
      }
    }
  }

  const counts = groups.map((g) => g[1]);

  if (straightHigh && isFlush) {
    return { category: "straight-flush", rank: [8, straightHigh], cards };
  }
  if (counts[0] === 4) {
    const kicker = groups.find((g) => g[1] === 1)?.[0] ?? 0;
    return { category: "four-of-a-kind", rank: [7, groups[0][0], kicker], cards };
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return { category: "full-house", rank: [6, groups[0][0], groups[1][0]], cards };
  }
  if (isFlush) {
    return { category: "flush", rank: [5, ...ranksDesc], cards };
  }
  if (straightHigh) {
    return { category: "straight", rank: [4, straightHigh], cards };
  }
  if (counts[0] === 3) {
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { category: "three-of-a-kind", rank: [3, groups[0][0], ...kickers], cards };
  }
  if (counts[0] === 2 && counts[1] === 2) {
    const pairRanks = groups.filter((g) => g[1] === 2).map((g) => g[0]).sort((a, b) => b - a);
    const kicker = groups.find((g) => g[1] === 1)?.[0] ?? 0;
    return { category: "two-pair", rank: [2, ...pairRanks, kicker], cards };
  }
  if (counts[0] === 2) {
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { category: "pair", rank: [1, groups[0][0], ...kickers], cards };
  }
  return { category: "high-card", rank: [0, ...ranksDesc], cards };
}

export function compareHandScores(a: HandScore, b: HandScore): number {
  const len = Math.max(a.rank.length, b.rank.length);
  for (let i = 0; i < len; i++) {
    const av = a.rank[i] ?? -1;
    const bv = b.rank[i] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/** Best 5-card hand out of up to 7 cards (hole + board). */
export function evaluateBestHand(cards: Card[]): HandScore {
  if (cards.length < 5) throw new Error("Need at least 5 cards to evaluate a hand");
  if (cards.length === 5) return evaluate5(cards);
  let best: HandScore | null = null;
  for (const combo of combinations(cards, 5)) {
    const score = evaluate5(combo);
    if (!best || compareHandScores(score, best) > 0) best = score;
  }
  return best as HandScore;
}

export function categoryLabel(category: HandCategory): string {
  const labels: Record<HandCategory, string> = {
    "high-card": "Carta alta",
    pair: "Par",
    "two-pair": "Doble par",
    "three-of-a-kind": "Trío",
    straight: "Escalera",
    flush: "Color",
    "full-house": "Full house",
    "four-of-a-kind": "Póker",
    "straight-flush": "Escalera de color",
  };
  return labels[category];
}

export const HAND_CATEGORY_ORDER = CATEGORY_ORDER;
