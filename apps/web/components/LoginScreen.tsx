"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";

export function LoginScreen() {
  const [name, setName] = useState("");
  const login = useStore((s) => s.login);
  const authError = useStore((s) => s.authError);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f14] px-4">
      <div className="w-full max-w-sm bg-white/5 rounded-2xl p-6 border border-white/10">
        <h1 className="text-2xl font-bold text-chip-gold mb-1">OpenPoker Club</h1>
        <p className="text-sm text-white/60 mb-6">Texas Hold&apos;em contra la mesa, en varias partidas a la vez.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) login(name.trim());
          }}
          className="flex flex-col gap-3"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Elegí tu nombre de jugador"
            maxLength={24}
            className="rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-chip-gold"
          />
          <button
            type="submit"
            className="rounded-lg bg-chip-gold text-black font-semibold py-2 text-sm hover:brightness-110"
          >
            Entrar a jugar
          </button>
        </form>
        {authError && <p className="text-xs text-red-400 mt-2">{authError}</p>}
      </div>
    </div>
  );
}
