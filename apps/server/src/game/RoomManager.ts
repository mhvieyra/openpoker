import { randomUUID } from "node:crypto";
import type { BlindLevel } from "@openpoker/engine";
import type { TableSummary, TournamentSummary } from "@openpoker/shared";
import { PokerTableRoom } from "./PokerTableRoom.js";
import { TournamentRoom } from "./TournamentRoom.js";
import { adjustBalance, getAccount } from "../store.js";

interface CashTableBlueprint {
  name: string;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  defaultBuyIn: number;
}

const CASH_TABLE_BLUEPRINTS: CashTableBlueprint[] = [
  { name: "Mesa Rio - NLHE 25/50", smallBlind: 25, bigBlind: 50, maxSeats: 6, defaultBuyIn: 5_000 },
  { name: "Mesa Vega - NLHE 50/100", smallBlind: 50, bigBlind: 100, maxSeats: 6, defaultBuyIn: 10_000 },
  { name: "Mesa Sol - NLHE 100/200", smallBlind: 100, bigBlind: 200, maxSeats: 9, defaultBuyIn: 20_000 },
  { name: "Mesa Luna - NLHE 250/500", smallBlind: 250, bigBlind: 500, maxSeats: 9, defaultBuyIn: 50_000 },
];

function knockoutBlindLevels(): BlindLevel[] {
  const pairs: Array<[number, number]> = [
    [50, 100], [75, 150], [100, 200], [150, 300], [200, 400],
    [300, 600], [400, 800], [600, 1200], [800, 1600], [1200, 2400],
  ];
  return pairs.map(([sb, bb]) => ({ smallBlind: sb, bigBlind: bb, ante: Math.round(bb * 0.125), durationSeconds: 300 }));
}

export class RoomManager {
  private cashTables = new Map<string, PokerTableRoom>();
  private tournaments = new Map<string, TournamentRoom>();

  constructor() {
    for (const bp of CASH_TABLE_BLUEPRINTS) {
      const id = `cash_${bp.name.split(" ")[1].toLowerCase()}`;
      const room = new PokerTableRoom({
        id,
        name: bp.name,
        maxSeats: bp.maxSeats,
        blinds: { smallBlind: bp.smallBlind, bigBlind: bp.bigBlind, ante: 0, durationSeconds: Infinity },
        mode: "cash",
        defaultBuyIn: bp.defaultBuyIn,
        autoFillBots: true,
        minPlayersToKeepLively: Math.min(4, bp.maxSeats),
        turnTimeMs: 20_000,
      });
      this.cashTables.set(id, room);
    }
    this.spawnKnockoutTournament();
  }

  private spawnKnockoutTournament(): void {
    const id = `ko_${randomUUID().slice(0, 8)}`;
    const tournament = new TournamentRoom({
      id,
      name: "New Year Series - Knockout Bounty",
      buyIn: 1_000,
      bountyPerPlayer: 500,
      startingStack: 20_000,
      maxSeatsPerTable: 6,
      targetField: 18,
      blindLevels: knockoutBlindLevels(),
      registrationWindowMs: 30_000,
    });
    this.tournaments.set(id, tournament);

    // Keep the lobby stocked: replace finished tournaments with a fresh one.
    const checkFinished = setInterval(() => {
      if (tournament.getStatus() === "finished") {
        clearInterval(checkFinished);
        this.spawnKnockoutTournament();
      }
    }, 10_000);
  }

  listCashTables(): TableSummary[] {
    return [...this.cashTables.values()].map((t) => t.getSummary());
  }

  listTournaments(): TournamentSummary[] {
    return [...this.tournaments.values()].map((t) => t.getSummary());
  }

  joinCashTable(userId: string, tableId: string, buyIn: number): { ok: true; seatIndex: number } | { ok: false; error: string } {
    const room = this.cashTables.get(tableId);
    if (!room) return { ok: false, error: "Mesa no encontrada." };
    const account = getAccount(userId);
    if (!account || account.balance < buyIn) return { ok: false, error: "Saldo insuficiente." };
    if (room.seatedUserIds().includes(userId)) return { ok: false, error: "Ya estás sentado en esta mesa." };
    adjustBalance(userId, -buyIn);
    const seatIndex = room.addHuman(userId, buyIn);
    return { ok: true, seatIndex };
  }

  leaveCashTable(userId: string, tableId: string): void {
    this.cashTables.get(tableId)?.removeHuman(userId);
  }

  registerTournament(userId: string, tournamentId: string) {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return { ok: false as const, error: "Torneo no encontrado." };
    return tournament.register(userId);
  }

  findRoomForAction(userId: string, tableId: string): PokerTableRoom | undefined {
    const cash = this.cashTables.get(tableId);
    if (cash && cash.seatedUserIds().includes(userId)) return cash;
    for (const tournament of this.tournaments.values()) {
      const table = tournament.getTableForUser(userId);
      if (table && table.id === tableId) return table;
    }
    return undefined;
  }

  disconnectUser(userId: string): void {
    for (const room of this.cashTables.values()) {
      if (room.seatedUserIds().includes(userId)) room.removeHuman(userId);
    }
    // Tournament seats are left in place (auto-fold via the turn timer) so busting out is real.
  }
}
