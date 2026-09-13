"use client";

import { useState } from "react";
import type { HandHistoryEntry } from "@/lib/store";

const TABS = ["Manos", "Notas", "Stats", "Info"] as const;

export function HandHistoryPanel({ history }: { history: HandHistoryEntry[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Manos");

  return (
    <div className="w-56 shrink-0 bg-black/50 border-r border-white/10 flex flex-col text-xs">
      <div className="flex border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 ${tab === t ? "text-chip-gold border-b-2 border-chip-gold" : "text-white/50 hover:text-white/80"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {tab === "Manos" &&
          (history.length === 0 ? (
            <p className="text-white/30 italic">Todavía no se jugó ninguna mano.</p>
          ) : (
            history.map((h) => (
              <div key={h.handId} className="text-white/70 leading-snug border-b border-white/5 pb-1.5">
                {h.summary || "Mano sin ganador registrado"}
              </div>
            ))
          ))}
        {tab === "Notas" && <p className="text-white/30 italic">Sin notas todavía.</p>}
        {tab === "Stats" && <p className="text-white/30 italic">Próximamente.</p>}
        {tab === "Info" && (
          <p className="text-white/50 leading-snug">
            Mesa de Texas Hold&apos;em No Limit. Las acciones se resuelven automáticamente cuando
            se cumple el tiempo de turno.
          </p>
        )}
      </div>
    </div>
  );
}
