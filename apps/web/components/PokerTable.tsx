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

const DOT_TEXTURE =
  "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1.2px)";
const RX = 40;
const RY = 34;

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
        <div className="flex items-center justify-between px-3 py-2 text-sm text-white/70 bg-black/40 z-10">
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
          className="relative flex-1 flex items-center justify-center p-6 overflow-hidden"
          style={{ background: "radial-gradient(ellipse at 50% 32%, #14141c 0%, #050508 78%)" }}
        >
          <div className="relative w-full max-w-[1150px] max-h-full aspect-[2.05/1]">
            <div
              className="absolute inset-0 rounded-[50%] overflow-hidden"
              style={{
                background: "radial-gradient(ellipse at 50% 42%, #1f6fb5 0%, #145189 48%, #0a2f57 100%)",
                boxShadow: "0 0 0 3px #0a2340, 0 25px 60px rgba(0,0,0,0.65), inset 0 0 80px rgba(0,0,0,0.55)",
              }}
            >
              <div className="absolute inset-0" style={{ backgroundImage: DOT_TEXTURE, backgroundSize: "16px 16px" }} />

              {/* bet chips between each seat and the center */}
              {hand?.players.map((p) => {
                if (p.betThisStreet <= 0) return null;
                const seatIdx = rotated.findIndex((s) => s.playerId === p.id);
                if (seatIdx === -1) return null;
                const seatPos = ellipsePoint(seatIdx, total, RX, RY);
                const chipPos = lerp(seatPos, { x: 50, y: 50 }, 0.4);
                return (
                  <div
                    key={p.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 bg-black/55 rounded-full pl-1 pr-2 py-0.5 z-10"
                    style={{ top: `${chipPos.y}%`, left: `${chipPos.x}%` }}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/50"
                      style={{ background: "radial-gradient(circle at 35% 30%, #f4d35e, #b8860b)" }}
                    />
                    <span className="text-[10px] font-semibold text-white">{p.betThisStreet.toLocaleString()}</span>
                  </div>
                );
              })}

              {/* board + pot */}
              <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 z-10">
                <div className="text-xs text-white/90 bg-black/45 px-2.5 py-0.5 rounded-full font-medium">
                  Pot: {hand?.totalPot ?? 0}
                </div>
                <div className="flex gap-1 min-h-[3rem]">
                  {hand?.board.map((c, i) => (
                    <PlayingCard key={i} card={c} size="md" />
                  ))}
                </div>
                <div className="text-[10px] text-white/40 mt-0.5">
                  {table.name} · ${table.blinds.bigBlind} NLHE
                </div>
              </div>

              {rotated.map((seat, i) => {
                const pos = ellipsePoint(i, total, RX, RY);
                const playerHand = hand?.players.find((p) => p.id === seat.playerId);
                const isButton = hand?.buttonSeatIndex === seat.seatIndex;
                const isActing = hand?.toActPlayerId === seat.playerId;
                const revealed = playerHand?.holeCardsRevealed;
                const folded = !!playerHand?.folded;

                // Avatar always leans toward the center of the table; name/stack sit on the rail side.
                const side = pos.x < 46 ? "left" : pos.x > 54 ? "right" : "middle";
                const rowDirection = side === "right" ? "flex-row-reverse" : "flex-row";
                const textAlign = side === "right" ? "text-left" : side === "left" ? "text-right" : "text-center";

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

                    <div className={`flex items-center gap-1.5 ${rowDirection} ${folded ? "opacity-40" : ""}`}>
                      <div className={`leading-tight ${textAlign}`}>
                        <div className="text-[11px] px-1.5 py-0.5 rounded bg-black/65 max-w-[78px] truncate">{seat.displayName}</div>
                        <div className="text-[11px] font-bold text-white">{seat.stack.toLocaleString()}</div>
                      </div>
                      <div className="relative">
                        <Avatar seed={seat.displayName} size={44} ring={isActing ? "#e8b923" : undefined} />
                        {isButton && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white text-[9px] font-bold flex items-center justify-center text-black shadow border border-black/20 z-10">
                            D
                          </div>
                        )}
                        {table.mode === "tournament" && table.bountyPerKnockout && (
                          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-[#7a1220] text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-white/60 whitespace-nowrap">
                            <span>⊕</span>
                            <span>${table.bountyPerKnockout}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {playerHand?.allIn && <div className="text-[10px] text-red-400 font-semibold">ALL-IN</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-h-[92px] flex items-center justify-center px-3 pb-2 bg-black/40 z-10">
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
