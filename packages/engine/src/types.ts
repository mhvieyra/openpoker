import type { Card } from "./card.js";
import type { HandScore } from "./handEvaluator.js";

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "complete";

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "all-in" | "post-blind";

export interface PlayerAction {
  playerId: string;
  type: ActionType;
  amount: number;
  street: Street;
  timestamp: number;
}

export interface ActionOption {
  type: "fold" | "check" | "call" | "bet" | "raise" | "all-in";
  toCall?: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface HandPlayerState {
  id: string;
  seatIndex: number;
  startingStack: number;
  stack: number;
  holeCards: Card[];
  betThisStreet: number;
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
  isBot: boolean;
}

export interface PotShare {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface ShowdownResult {
  playerId: string;
  handScore: HandScore;
  amountWon: number;
  revealed: boolean;
}

export interface HandPublicState {
  handId: string;
  street: Street;
  board: Card[];
  pots: PotShare[];
  totalPot: number;
  buttonSeatIndex: number;
  toActPlayerId: string | null;
  currentBet: number;
  minRaiseTo: number;
  players: Array<{
    id: string;
    seatIndex: number;
    stack: number;
    betThisStreet: number;
    folded: boolean;
    allIn: boolean;
    holeCardsRevealed: Card[] | null;
  }>;
  actionHistory: PlayerAction[];
  showdown: ShowdownResult[] | null;
}

export interface SeatInput {
  id: string;
  seatIndex: number;
  stack: number;
  isBot: boolean;
}
