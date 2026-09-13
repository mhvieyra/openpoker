import type { HandPlayerState, PotShare } from "./types.js";

/** Classic side-pot layering algorithm based on each player's total chips committed this hand. */
export function computePots(players: HandPlayerState[]): PotShare[] {
  const contributions = players
    .map((p) => ({ id: p.id, amount: p.totalCommitted, folded: p.folded }))
    .filter((c) => c.amount > 0);

  const levels = [...new Set(contributions.map((c) => c.amount))].sort((a, b) => a - b);

  const pots: PotShare[] = [];
  let prevLevel = 0;
  for (const level of levels) {
    const layer = level - prevLevel;
    const contributors = contributions.filter((c) => c.amount >= level);
    const potSize = layer * contributors.length;
    if (potSize > 0) {
      const eligiblePlayerIds = contributors.filter((c) => !c.folded).map((c) => c.id);
      if (eligiblePlayerIds.length > 0) {
        pots.push({ amount: potSize, eligiblePlayerIds });
      } else if (pots.length > 0) {
        // Everyone eligible for this layer folded (dead money); fold it into the previous pot.
        pots[pots.length - 1].amount += potSize;
      }
    }
    prevLevel = level;
  }

  // Merge adjacent pots that ended up with the exact same eligible player set.
  const merged: PotShare[] = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && sameSet(last.eligiblePlayerIds, pot.eligiblePlayerIds)) {
      last.amount += pot.amount;
    } else {
      merged.push({ ...pot });
    }
  }
  return merged;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((id) => sa.has(id));
}
