import test from "node:test";
import assert from "node:assert/strict";
import { Hand } from "./hand.js";
import { evaluateBestHand } from "./handEvaluator.js";
import { cardFromString } from "./card.js";

test("heads-up hand: blinds posted correctly and pot awarded on fold", () => {
  const hand = new Hand({
    handId: "t1",
    seats: [
      { id: "A", seatIndex: 0, stack: 1000, isBot: false },
      { id: "B", seatIndex: 1, stack: 1000, isBot: false },
    ],
    buttonSeatIndex: 0,
    smallBlind: 10,
    bigBlind: 20,
  });

  // Heads-up: button (A) is SB and acts first preflop.
  assert.equal(hand.getToActPlayerId(), "A");
  hand.applyAction("A", "fold");
  assert.ok(hand.isComplete());
  const stacks = hand.getFinalStacks();
  assert.equal(stacks.A, 990); // lost the 10 SB
  assert.equal(stacks.B, 1010); // won the pot (10 + 20)
});

test("6-max hand runs to showdown and awards pot to best hand", () => {
  const hand = new Hand({
    handId: "t2",
    seats: [
      { id: "P0", seatIndex: 0, stack: 1000, isBot: false },
      { id: "P1", seatIndex: 1, stack: 1000, isBot: false },
      { id: "P2", seatIndex: 2, stack: 1000, isBot: false },
    ],
    buttonSeatIndex: 0,
    smallBlind: 10,
    bigBlind: 20,
  });

  // Preflop order: UTG (P0, since 3-handed btn+3%3=0), SB(P1), BB(P2)
  let toAct = hand.getToActPlayerId()!;
  while (hand.getPublicState().street === "preflop" && !hand.isComplete()) {
    const opts = hand.getActionOptions(toAct);
    const call = opts.find((o) => o.type === "call");
    if (call) hand.applyAction(toAct, "call", call.toCall);
    else hand.applyAction(toAct, "check");
    toAct = hand.getToActPlayerId()!;
    if (!toAct) break;
  }

  // Check/call through flop, turn, river
  for (let street = 0; street < 3 && !hand.isComplete(); street++) {
    let cur = hand.getToActPlayerId();
    while (cur) {
      hand.applyAction(cur, "check");
      cur = hand.getToActPlayerId();
    }
  }

  assert.ok(hand.isComplete());
  const state = hand.getPublicState();
  assert.equal(state.street, "complete");
  assert.ok(state.showdown && state.showdown.length > 0);
  const totalWon = state.showdown!.reduce((s, r) => s + r.amountWon, 0);
  assert.equal(totalWon, 60); // 3 players each put in 20 preflop (UTG calls, SB completes, BB checks), no further betting
});

test("hand evaluator ranks a flush above a straight", () => {
  const flush = evaluateBestHand([
    cardFromString("Ah"), cardFromString("Kh"), cardFromString("Qh"), cardFromString("Jh"), cardFromString("9h"),
    cardFromString("2c"), cardFromString("3d"),
  ]);
  const straight = evaluateBestHand([
    cardFromString("Ah"), cardFromString("Kd"), cardFromString("Qc"), cardFromString("Js"), cardFromString("Th"),
    cardFromString("2c"), cardFromString("3d"),
  ]);
  assert.equal(flush.category, "flush");
  assert.equal(straight.category, "straight");
});

test("wheel straight (A-2-3-4-5) is detected", () => {
  const wheel = evaluateBestHand([
    cardFromString("Ah"), cardFromString("2d"), cardFromString("3c"), cardFromString("4s"), cardFromString("5h"),
    cardFromString("Kc"), cardFromString("9d"),
  ]);
  assert.equal(wheel.category, "straight");
  assert.equal(wheel.rank[1], 5);
});

test("all-in side pots split correctly across multiple stack sizes", () => {
  const hand = new Hand({
    handId: "t3",
    seats: [
      { id: "Short", seatIndex: 0, stack: 50, isBot: false },
      { id: "Mid", seatIndex: 1, stack: 150, isBot: false },
      { id: "Big", seatIndex: 2, stack: 500, isBot: false },
    ],
    buttonSeatIndex: 2,
    smallBlind: 10,
    bigBlind: 20,
  });
  // 3-handed, button=seat2 -> SB=seat0(Short), BB=seat1(Mid), UTG/first-to-act=seat2(Big)
  let toAct: string | null = hand.getToActPlayerId();
  assert.equal(toAct, "Big");
  hand.applyAction(toAct!, "all-in");
  toAct = hand.getToActPlayerId();
  hand.applyAction(toAct!, "all-in"); // Short or Mid, whoever is next, goes all-in too
  toAct = hand.getToActPlayerId();
  if (toAct) hand.applyAction(toAct, "all-in");

  assert.ok(hand.isComplete());
  const stacks = hand.getFinalStacks();
  const total = Object.values(stacks).reduce((a, b) => a + b, 0);
  assert.equal(total, 50 + 150 + 500);
});
