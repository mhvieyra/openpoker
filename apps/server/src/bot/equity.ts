import type { Card, Rank } from "@openpoker/engine";
import { evaluateBestHand, compareHandScores } from "@openpoker/engine";

const ALL_RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const ALL_SUITS = ["s", "h", "d", "c"] as const;

function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of ALL_SUITS) for (const rank of ALL_RANKS) deck.push({ rank, suit });
  return deck;
}

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
}

/** Chen formula: quick, well-known heuristic for preflop starting-hand strength (roughly 0-20). */
export function chenScore(hole: [Card, Card]): number {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank);
  const pointsForRank = (rank: Rank): number => {
    if (rank === 14) return 10;
    if (rank === 13) return 8;
    if (rank === 12) return 7;
    if (rank === 11) return 6;
    return rank / 2;
  };

  let score: number;
  if (a.rank === b.rank) {
    score = Math.max(pointsForRank(a.rank) * 2, 5);
  } else {
    score = pointsForRank(a.rank);
    if (a.suit === b.suit) score += 2;
    const gap = a.rank - b.rank - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    if (gap === 0 && a.rank < 12) score += 1;
  }
  return Math.max(0, score);
}

/** Normalizes Chen score (~0-20) to a rough 0-1 preflop strength. */
export function preflopStrength(hole: [Card, Card]): number {
  return Math.max(0, Math.min(1, chenScore(hole) / 20));
}

export interface EquityInput {
  hole: Card[];
  board: Card[];
  opponents: number;
  deadCards?: Card[];
  trials?: number;
}

/** Monte Carlo equity estimate: probability hero's best hand beats/ties random opponents. */
export function estimateEquity({ hole, board, opponents, deadCards = [], trials = 200 }: EquityInput): number {
  if (opponents <= 0) return 1;
  const known = new Set([...hole, ...board, ...deadCards].map(cardKey));
  const deck = fullDeck().filter((c) => !known.has(cardKey(c)));

  let wins = 0;
  let ties = 0;

  for (let t = 0; t < trials; t++) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let cursor = 0;
    const oppHoles: Card[][] = [];
    for (let o = 0; o < opponents; o++) {
      oppHoles.push([shuffled[cursor], shuffled[cursor + 1]]);
      cursor += 2;
    }
    const remainingBoard = [...board];
    while (remainingBoard.length < 5) {
      remainingBoard.push(shuffled[cursor]);
      cursor += 1;
    }

    const heroScore = evaluateBestHand([...hole, ...remainingBoard]);
    let heroBeatsAll = true;
    let tie = false;
    for (const oh of oppHoles) {
      const oppScore = evaluateBestHand([...oh, ...remainingBoard]);
      const cmp = compareHandScores(heroScore, oppScore);
      if (cmp < 0) {
        heroBeatsAll = false;
        break;
      }
      if (cmp === 0) tie = true;
    }
    if (heroBeatsAll) {
      if (tie) ties += 1;
      else wins += 1;
    }
  }

  return (wins + ties * 0.5) / trials;
}
