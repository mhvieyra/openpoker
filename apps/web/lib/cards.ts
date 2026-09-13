import type { CardLike } from "./store";

const RANK_LABEL: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};

const SUIT_SYMBOL: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function parseCard(input: string | CardLike): CardLike {
  if (typeof input !== "string") return input;
  const suit = input.slice(-1);
  const rank = Number(input.slice(0, -1));
  return { rank, suit };
}

export function rankLabel(rank: number): string {
  return RANK_LABEL[rank] ?? String(rank);
}

export function suitSymbol(suit: string): string {
  return SUIT_SYMBOL[suit] ?? suit;
}

export function isRed(suit: string): boolean {
  return suit === "h" || suit === "d";
}
