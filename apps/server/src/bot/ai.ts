import type { ActionOption, ActionType, Card, HandPublicState } from "@openpoker/engine";
import type { BotPersonality } from "@openpoker/shared";
import { estimateEquity, preflopStrength } from "./equity.js";

export interface BotDecisionContext {
  personality: BotPersonality;
  hole: Card[];
  state: HandPublicState;
  options: ActionOption[];
  myPlayerId: string;
  myStack: number;
}

export interface BotDecision {
  type: ActionType;
  amount: number;
  /** Simulated "thinking" delay before the action is sent, for realism. */
  thinkTimeMs: number;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function thinkTime(personality: BotPersonality, isBigDecision: boolean): number {
  const base = isBigDecision ? randomBetween(1400, 3600) : randomBetween(500, 1600);
  return Math.round(base * personality.paceMultiplier);
}

function opponentsInHand(state: HandPublicState, myPlayerId: string): number {
  return state.players.filter((p) => p.id !== myPlayerId && !p.folded).length;
}

function potOdds(toCall: number, pot: number): number {
  if (toCall <= 0) return 0;
  return toCall / (pot + toCall);
}

export function decideBotAction(ctx: BotDecisionContext): BotDecision {
  const { personality, hole, state, options, myPlayerId, myStack } = ctx;
  const opponents = Math.max(1, opponentsInHand(state, myPlayerId));

  const strength =
    state.street === "preflop"
      ? preflopStrength(hole as [Card, Card])
      : estimateEquity({ hole, board: state.board, opponents, trials: 150 });

  const callOption = options.find((o) => o.type === "call");
  const checkOption = options.find((o) => o.type === "check");
  const betOption = options.find((o) => o.type === "bet");
  const raiseOption = options.find((o) => o.type === "raise");
  const foldAvailable = options.some((o) => o.type === "fold");

  const toCall = callOption?.toCall ?? 0;
  const odds = potOdds(toCall, state.totalPot);

  // Looser/aggressive personalities perceive hands as relatively stronger; tighter ones discount them.
  const perceivedStrength = strength * (0.75 + personality.looseness * 0.5) + personality.aggression * 0.05;

  const wantsToBluff = Math.random() < personality.bluffFrequency && strength < 0.35;
  const effectiveStrength = wantsToBluff ? Math.max(perceivedStrength, 0.7) : perceivedStrength;

  const isBigDecision = toCall > state.totalPot * 0.4 || (betOption?.maxAmount ?? 0) > myStack * 0.5;

  // No bet facing us: decide whether to check or bet/raise for value or as a bluff.
  if (checkOption && (betOption || raiseOption)) {
    const betLikeOption = betOption ?? raiseOption!;
    const shouldBet = effectiveStrength > 0.55 + (1 - personality.aggression) * 0.2;
    if (shouldBet && betLikeOption.maxAmount) {
      const potFraction = randomBetween(0.4, 1.0) * (0.6 + personality.aggression * 0.6);
      const rawAmount = Math.max(betLikeOption.minAmount ?? state.currentBet, state.totalPot * potFraction);
      const amount = Math.min(betLikeOption.maxAmount, Math.round(rawAmount));
      return { type: betOption ? "bet" : "raise", amount, thinkTimeMs: thinkTime(personality, isBigDecision) };
    }
    return { type: "check", amount: 0, thinkTimeMs: thinkTime(personality, false) };
  }

  // Facing a bet: fold / call / raise based on equity vs pot odds.
  if (callOption) {
    const raiseThreshold = 0.72 - personality.aggression * 0.15;
    if (raiseOption && raiseOption.maxAmount && effectiveStrength > raiseThreshold) {
      const sizeFactor = randomBetween(0.5, 1.0) * (0.7 + personality.aggression * 0.5);
      const raiseTo = Math.min(
        raiseOption.maxAmount,
        Math.max(raiseOption.minAmount ?? state.minRaiseTo, state.currentBet + state.totalPot * sizeFactor),
      );
      return { type: "raise", amount: Math.round(raiseTo), thinkTimeMs: thinkTime(personality, true) };
    }

    const callThreshold = odds - personality.looseness * 0.08;
    if (effectiveStrength + 0.03 >= callThreshold || toCall === 0) {
      return { type: "call", amount: toCall, thinkTimeMs: thinkTime(personality, isBigDecision) };
    }

    if (foldAvailable) {
      return { type: "fold", amount: 0, thinkTimeMs: thinkTime(personality, isBigDecision) };
    }
  }

  if (checkOption) return { type: "check", amount: 0, thinkTimeMs: thinkTime(personality, false) };
  if (foldAvailable) return { type: "fold", amount: 0, thinkTimeMs: thinkTime(personality, false) };

  const allIn = options.find((o) => o.type === "all-in");
  return { type: "all-in", amount: allIn?.maxAmount ?? myStack, thinkTimeMs: thinkTime(personality, true) };
}
