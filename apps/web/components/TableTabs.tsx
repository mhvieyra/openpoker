"use client";

import { useStore } from "@/lib/store";

export function TableTabs() {
  const openTableIds = useStore((s) => s.openTableIds);
  const activeTableId = useStore((s) => s.activeTableId);
  const tables = useStore((s) => s.tables);
  const setActiveTable = useStore((s) => s.setActiveTable);
  const closeTab = useStore((s) => s.closeTab);

  if (openTableIds.length === 0) {
    return <div className="text-white/40 text-sm px-2 py-3">Sentate en una mesa de la izquierda para empezar a jugar. Podés abrir varias mesas a la vez.</div>;
  }

  return (
    <div className="flex gap-1 px-2 pt-2 overflow-x-auto">
      {openTableIds.map((id) => {
        const table = tables[id];
        return (
          <button
            key={id}
            onClick={() => setActiveTable(id)}
            className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs whitespace-nowrap ${
              activeTableId === id ? "bg-felt text-white" : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            <span>{table?.name ?? id}</span>
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(id);
              }}
              className="opacity-0 group-hover:opacity-100 text-white/50 hover:text-white"
            >
              ×
            </span>
          </button>
        );
      })}
    </div>
  );
}
