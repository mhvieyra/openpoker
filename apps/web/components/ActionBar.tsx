"use client";

import { useMemo, useState } from "react";
import type { ActionOptionView, ActionType, HandView } from "@/lib/store";

export function ActionBar({
  options,
  hand,
  onAction,
}: {
  options: ActionOptionView[];
  hand: HandView;
  onAction: (action: ActionType, amount?: number) => void;
}) {
  const betOrRaise = options.find((o) => o.type === "bet" || o.type === "raise");
  const [amount, setAmount] = useState<number>(betOrRaise?.minAmount ?? 0);

  const min = betOrRaise?.minAmount ?? 0;
  const max = betOrRaise?.maxAmount ?? 0;
  const clamped = Math.min(Math.max(amount, min), max || min);

  const quickSizes = useMemo(() => {
    if (!betOrRaise) return [];
    const pot = hand.totalPot || 1;
    return [
      { label: "1/2 pot", value: Math.round(pot * 0.5) },
      { label: "Pot", value: Math.round(pot) },
      { label: "All-in", value: max },
    ]
      .map((s) => ({ ...s, value: Math.min(Math.max(s.value, min), max) }))
      .filter((s, idx, arr) => arr.findIndex((x) => x.value === s.value) === idx);
  }, [betOrRaise, hand.totalPot, min, max]);

  if (options.length === 0) return null;

  return (
    <div className="w-full max-w-xl px-3">
      <div className="bg-black/70 backdrop-blur rounded-xl p-3 flex flex-col gap-2 border border-white/10">
        {betOrRaise && (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={min}
              max={Math.max(max, min)}
              value={clamped}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="flex-1 accent-chip-gold"
            />
            <span className="w-20 text-right font-mono text-sm text-chip-gold">{clamped}</span>
          </div>
        )}
        {betOrRaise && (
          <div className="flex gap-2">
            {quickSizes.map((s) => (
              <button
                key={s.label}
                onClick={() => setAmount(s.value)}
                className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 transition"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 justify-stretch">
          {options.find((o) => o.type === "fold") && (
            <ActionButton label="Retirarse" color="#7a2c2c" onClick={() => onAction("fold")} />
          )}
          {options.find((o) => o.type === "check") && (
            <ActionButton label="Pasar" color="#3a5a7d" onClick={() => onAction("check")} />
          )}
          {options.find((o) => o.type === "call") && (
            <ActionButton
              label={`Igualar ${options.find((o) => o.type === "call")?.toCall ?? ""}`}
              color="#3a7d4f"
              onClick={() => onAction("call", options.find((o) => o.type === "call")?.toCall)}
            />
          )}
          {betOrRaise && (
            <ActionButton
              label={betOrRaise.type === "bet" ? `Apostar ${clamped}` : `Subir a ${clamped}`}
              color="#a5750f"
              onClick={() => onAction(betOrRaise.type as ActionType, clamped)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2 rounded-lg font-semibold text-sm text-white transition hover:brightness-110 active:scale-[0.98]"
      style={{ background: color }}
    >
      {label}
    </button>
  );
}
