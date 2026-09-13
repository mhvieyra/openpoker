import test from "node:test";
import assert from "node:assert/strict";
import { TableEngine } from "./table.js";

test("TableEngine can start consecutive hands back to back (regression: currentHand must clear)", () => {
  const table = new TableEngine({
    maxSeats: 6,
    blinds: { smallBlind: 10, bigBlind: 20, ante: 0, durationSeconds: Infinity },
  });
  table.seatPlayer("A", 1000, false, 0);
  table.seatPlayer("B", 1000, false, 1);
  table.seatPlayer("C", 1000, false, 2);

  for (let i = 0; i < 3; i++) {
    assert.equal(table.canStartHand(), true, `should be able to start hand #${i + 1}`);
    const hand = table.startHand();
    // everyone folds except the last to act, so the hand resolves immediately
    let toAct = hand.getToActPlayerId();
    while (toAct && !hand.isComplete()) {
      const options = hand.getActionOptions(toAct);
      if (options.some((o) => o.type === "check")) hand.applyAction(toAct, "check");
      else hand.applyAction(toAct, "fold");
      toAct = hand.getToActPlayerId();
    }
    assert.equal(hand.isComplete(), true);
    table.syncStacksFromHand(hand);
  }
});
