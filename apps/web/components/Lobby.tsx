"use client";

import { useStore } from "@/lib/store";

const DEFAULT_BUY_IN: Record<string, number> = {
  cash_rio: 5000,
  cash_vega: 10000,
  cash_sol: 20000,
  cash_luna: 50000,
};

export function Lobby() {
  const lobbyTables = useStore((s) => s.lobbyTables);
  const lobbyTournaments = useStore((s) => s.lobbyTournaments);
  const joinTable = useStore((s) => s.joinTable);
  const registerTournament = useStore((s) => s.registerTournament);
  const openTableIds = useStore((s) => s.openTableIds);
  const auth = useStore((s) => s.auth);

  return (
    <div className="flex flex-col gap-4 w-full max-w-xs shrink-0 overflow-y-auto pr-1">
      <section>
        <h2 className="text-xs uppercase tracking-wide text-white/50 mb-2">Mesas</h2>
        <div className="flex flex-col gap-2">
          {lobbyTables.map((t) => (
            <div key={t.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{t.name}</div>
                <div className="text-xs text-white/50">
                  Ciegas ${t.stakes.replace("/", " / $")} · {t.playersSeated}/{t.maxSeats} jugadores
                </div>
              </div>
              <button
                disabled={openTableIds.includes(t.id) || !auth}
                onClick={() => joinTable(t.id, DEFAULT_BUY_IN[t.id] ?? 5000)}
                className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 font-medium"
              >
                {openTableIds.includes(t.id) ? "Sentado" : "Sentarse"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-white/50 mb-2">Torneos Knockout / Bounty</h2>
        <div className="flex flex-col gap-2">
          {lobbyTournaments.map((t) => (
            <div key={t.id} className="bg-white/5 rounded-lg p-3">
              <div className="text-sm font-medium">{t.name}</div>
              <div className="text-xs text-white/50 mt-0.5">
                {t.status === "registering" ? "Inscripción abierta" : t.status === "running" ? `Nivel ${t.currentLevel}` : "Finalizado"}
                {" · "}
                {t.playersRemaining} jugadores{t.status === "running" ? ` · stack prom. ${t.avgStack}` : ""}
              </div>
              <div className="text-xs text-chip-gold mt-0.5">Bounty ${t.bountyPerKnockout} por eliminación · {t.stakes}</div>
              <button
                disabled={t.status !== "registering" || !auth}
                onClick={() => registerTournament(t.id)}
                className="mt-2 w-full text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-medium"
              >
                Inscribirme
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
