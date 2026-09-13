"use client";

import type { TableView } from "@/lib/store";
import { useStore } from "@/lib/store";
import { PlayingCard, CardBack } from "./PlayingCard";
import { Avatar } from "./Avatar";
import { ActionBar } from "./ActionBar";
import { HandHistoryPanel } from "./HandHistoryPanel";

function ellipsePoint(index: number, total: number, rx: number, ry: number) {
  const angle = (index / total) * 2 * Math.PI + Math.PI / 2;
  return { x: 50 + rx * Math.cos(angle), y: 50 + ry * Math.sin(angle) };
}

function lerp(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function PokerTable({ table }: { table: TableView }) {
  const sendAction = useStore((s) => s.sendAction);
  const leaveTable = useStore((s) => s.leaveTable);

  const seats = [...table.seats].sort((a, b) => a.seatIndex - b.seatIndex);
  const youSeat = seats.find((s) => s.isYou);
  const rotated = youSeat
    ? (() => {
        const idx = seats.findIndex((s) => s.seatIndex === youSeat.seatIndex);
        return [...seats.slice(idx), ...seats.slice(0, idx)];
      })()
    : seats;

  const hand = table.hand;
  const isMyTurn = !!youSeat && hand?.toActPlayerId === youSeat.playerId;
  const total = rotated.length || table.maxSeats;
  const avgStack = seats.length ? Math.round(seats.reduce((s, p) => s + p.stack, 0) / seats.length) : 0;

  return (
    <div className="w-full h-full min-h-[560px] flex">
      <HandHistoryPanel history={table.history} />

      <div className="relative flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-3 py-2 text-sm text-white/70 bg-black/30">
          <span>
            {table.name} · Ciegas ${table.blinds.smallBlind}/${table.blinds.bigBlind}
            {table.blinds.ante ? ` · Ante $${table.blinds.ante}` : ""}
          </span>
          <div className="flex items-center gap-3 text-xs">
            {table.mode === "tournament" && (
              <span className="bg-white/10 px-2 py-1 rounded-full">
                Prom: {avgStack.toLocaleString()} · {seats.length} jugadores
              </span>
            )}
            {table.mode === "cash" && (
              <button onClick={() => leaveTable(table.tableId)} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20">
                Salir de la mesa
              </button>
            )}
          </div>
        </div>

        <div
          className="relative flex-1 mx-3 mt-1 mb-2 rounded-[46%] border-[10px] border-[#1c2836] shadow-2xl overflow-hidden"
          style={{
            background: "radial-gradient(ellipse at center, #1e5f9e 0%, #164a80 45%, #0d3060 100%)",
          }}
        >
          <div className="absolute inset-0 rounded-[46%] shadow-[inset_0_0_90px_rgba(0,0,0,0.6)]" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <span className="text-white/10 font-black text-4xl md:text-5xl tracking-widest uppercase">
              {table.mode === "tournament" ? table.name : "OpenPoker"}
            </span>
          </div>

          {/* bet chips between each seat and the center */}
          {hand?.players.map((p) => {
            if (p.betThisStreet <= 0) return null;
            const seatIdx = rotated.findIndex((s) => s.playerId === p.id);
            if (seatIdx === -1) return null;
            const seatPos = ellipsePoint(seatIdx, total, 44, 34);
            const chipPos = lerp(seatPos, { x: 50, y: 50 }, 0.42);
            return (
              <div
                key={p.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 bg-black/60 rounded-full pl-1 pr-2 py-0.5"
                style={{ top: `${chipPos.y}%`, left: `${chipPos.x}%` }}
              >
                <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-chip-gold to-yellow-700 border border-yellow-200/60" />
                <span className="text-[10px] font-semibold text-white">{p.betThisStreet.toLocaleString()}</span>
              </div>
            );
          })}

          {/* board + pot */}
          <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
            <div className="text-xs text-white/80 bg-black/40 px-2.5 py-0.5 rounded-full">
              Pozo: {hand?.totalPot ?? 0}
            </div>
            <div className="flex gap-1 min-h-[3rem]">
              {hand?.board.map((c, i) => (
                <PlayingCard key={i} card={c} size="md" />
              ))}
            </div>
          </div>

          {rotated.map((seat, i) => {
            const pos = ellipsePoint(i, total, 44, 34);
            const playerHand = hand?.players.find((p) => p.id === seat.playerId);
            const isButton = hand?.buttonSeatIndex === seat.seatIndex;
            const isActing = hand?.toActPlayerId === seat.playerId;
            const revealed = playerHand?.holeCardsRevealed;
            const folded = !!playerHand?.folded;

            return (
              <div
                key={seat.seatIndex}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-20"
                style={{ top: `${pos.y}%`, left: `${pos.x}%` }}
              >
                <div className="flex gap-0.5 min-h-[2rem]">
                  {seat.isYou && table.myHoleCards.length > 0 && !folded
                    ? table.myHoleCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
                    : revealed
                      ? revealed.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
                      : playerHand && !folded
                        ? [0, 1].map((i) => <CardBack key={i} size="sm" />)
                        : null}
                </div>

                <div className={`flex items-center gap-1.5 ${folded ? "opacity-40" : ""}`}>
                  <div className="text-right leading-tight">
                    <div className="text-[11px] px-1.5 py-0.5 rounded bg-black/65 max-w-[100px] truncate">{seat.displayName}</div>
                    <div className="text-[11px] font-bold text-white">{seat.stack.toLocaleString()}</div>
                  </div>
                  <div className="relative">
                    <Avatar seed={seat.displayName} size={44} ring={isActing ? "#e8b923" : undefined} />
                    {isButton && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white text-[9px] font-bold flex items-center justify-center text-black shadow border border-black/20">
                        D
                      </div>
                    )}
                  </div>
                </div>

                {playerHand?.allIn && <div className="text-[10px] text-red-400 font-semibold">ALL-IN</div>}
              </div>
            );
          })}
        </div>

        <div className="min-h-[92px] flex items-center justify-center px-3 pb-2">
          {isMyTurn && hand && (
            <ActionBar options={table.actionOptions} hand={hand} onAction={(action, amount) => sendAction(table.tableId, action, amount)} />
          )}

          {!isMyTurn && hand?.street === "complete" && hand.showdown && (
            <div className="bg-black/70 rounded-lg px-4 py-2 text-xs text-center">
              {hand.showdown
                .filter((r) => r.amountWon > 0)
                .map((r) => `${seats.find((s) => s.playerId === r.playerId)?.displayName ?? r.playerId} gana ${r.amountWon}`)
                .join(" · ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
