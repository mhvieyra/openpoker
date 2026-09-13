"use client";

import type { CardLike } from "@/lib/store";
import { parseCard, rankLabel, suitSymbol, isRed } from "@/lib/cards";

export function PlayingCard({ card, size = "md" }: { card: string | CardLike; size?: "sm" | "md" | "lg" }) {
  const { rank, suit } = parseCard(card);
  const dims = size === "sm" ? "w-6 h-8 text-[10px]" : size === "lg" ? "w-12 h-16 text-lg" : "w-9 h-12 text-sm";
  return (
    <div
      className={`${dims} rounded-md bg-white shadow-md flex flex-col items-center justify-center font-bold leading-none border border-black/10`}
      style={{ color: isRed(suit) ? "#c8272d" : "#141414" }}
    >
      <span>{rankLabel(rank)}</span>
      <span className="-mt-0.5">{suitSymbol(suit)}</span>
    </div>
  );
}

export function CardBack({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "w-6 h-8" : size === "lg" ? "w-12 h-16" : "w-9 h-12";
  return (
    <div
      className={`${dims} rounded-md border-2 border-white/80 shadow-md relative overflow-hidden`}
      style={{ background: "#a01f28" }}
    >
      <div
        className="absolute inset-0.5 rounded-sm"
        style={{
          background:
            "repeating-linear-gradient(45deg, #c22b35, #c22b35 3px, #a01f28 3px, #a01f28 6px)",
        }}
      />
    </div>
  );
}
