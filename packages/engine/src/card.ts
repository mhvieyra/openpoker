export type Suit = "s" | "h" | "d" | "c";

// 2..14 (11=J, 12=Q, 13=K, 14=A)
export type Rank =
  | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

const RANK_CHARS: Record<Rank, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "T", 11: "J", 12: "Q", 13: "K", 14: "A",
};

const CHAR_TO_RANK: Record<string, Rank> = Object.fromEntries(
  Object.entries(RANK_CHARS).map(([rank, ch]) => [ch, Number(rank) as Rank]),
) as Record<string, Rank>;

export function cardToString(card: Card): string {
  return `${RANK_CHARS[card.rank]}${card.suit}`;
}

export function cardFromString(input: string): Card {
  const rankChar = input.slice(0, -1);
  const suit = input.slice(-1) as Suit;
  const rank = CHAR_TO_RANK[rankChar];
  if (!rank || !["s", "h", "d", "c"].includes(suit)) {
    throw new Error(`Invalid card string: ${input}`);
  }
  return { rank, suit };
}

export const RANK_NAMES: Record<Rank, string> = {
  2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
  8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace",
};
