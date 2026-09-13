"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { LoginScreen } from "@/components/LoginScreen";
import { Lobby } from "@/components/Lobby";
import { TableTabs } from "@/components/TableTabs";
import { PokerTable } from "@/components/PokerTable";

export default function HomePage() {
  const connect = useStore((s) => s.connect);
  const auth = useStore((s) => s.auth);
  const activeTableId = useStore((s) => s.activeTableId);
  const tables = useStore((s) => s.tables);
  const lastError = useStore((s) => s.lastError);

  useEffect(() => {
    connect();
  }, [connect]);

  if (!auth) return <LoginScreen />;

  const activeTable = activeTableId ? tables[activeTableId] : undefined;

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-black/30">
        <span className="font-bold text-chip-gold">OpenPoker Club</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white/60">{auth.displayName}</span>
          <span className="font-mono bg-white/10 px-2 py-1 rounded">${auth.balance.toLocaleString()}</span>
        </div>
      </header>

      {lastError && (
        <div className="bg-amber-900/60 text-amber-200 text-xs px-4 py-1.5">{lastError}</div>
      )}

      <div className="flex flex-1 min-h-0 gap-3 p-3">
        <Lobby />
        <div className="flex-1 flex flex-col min-w-0 bg-black/20 rounded-xl border border-white/10">
          <TableTabs />
          <div className="flex-1 min-h-0">
            {activeTable ? <PokerTable table={activeTable} /> : (
              <div className="h-full flex items-center justify-center text-white/30 text-sm">
                Ninguna mesa activa todavía.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
