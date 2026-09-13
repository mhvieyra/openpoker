import type { BlindLevel, Hand } from "@openpoker/engine";
import type { TournamentSummary } from "@openpoker/shared";
import { PokerTableRoom } from "./PokerTableRoom.js";
import { checkoutBot, releaseBot, type SeatedBot } from "../bot/identity.js";
import { adjustBalance, getAccount } from "../store.js";
import { sendToUser } from "../ws/connections.js";

export interface TournamentConfig {
  id: string;
  name: string;
  buyIn: number;
  bountyPerPlayer: number;
  startingStack: number;
  maxSeatsPerTable: number;
  targetField: number;
  blindLevels: BlindLevel[];
  registrationWindowMs?: number;
}

interface Elimination {
  playerId: string;
  place: number;
}

export class TournamentRoom {
  readonly id: string;
  readonly name: string;
  private config: TournamentConfig;
  private status: "registering" | "running" | "finished" = "registering";
  private registeredHumans = new Set<string>();
  private botOccupants = new Map<string, SeatedBot>();
  private tables: PokerTableRoom[] = [];
  private levelIndex = 0;
  private levelStartedAt = 0;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private eliminations: Elimination[] = [];
  private allPlayerIds = new Set<string>();
  private startTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: TournamentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.config = config;
  }

  getStatus(): string {
    return this.status;
  }

  register(userId: string): { ok: true } | { ok: false; error: string } {
    if (this.status !== "registering") return { ok: false, error: "El torneo ya comenzó." };
    const account = getAccount(userId);
    if (!account || account.balance < this.config.buyIn) {
      return { ok: false, error: "Saldo insuficiente para inscribirte." };
    }
    if (this.registeredHumans.has(userId)) return { ok: true };
    adjustBalance(userId, -this.config.buyIn);
    this.registeredHumans.add(userId);
    if (!this.startTimer) {
      this.startTimer = setTimeout(() => this.start(), this.config.registrationWindowMs ?? 12_000);
    }
    return { ok: true };
  }

  private start(): void {
    if (this.status !== "registering") return;
    this.status = "running";

    const humanIds = [...this.registeredHumans];
    const botsNeeded = Math.max(0, this.config.targetField - humanIds.length);
    const bots: SeatedBot[] = Array.from({ length: botsNeeded }, () => checkoutBot());
    for (const bot of bots) this.botOccupants.set(bot.id, bot);

    const allPlayers: Array<{ id: string; isBot: boolean; bot?: SeatedBot }> = [
      ...humanIds.map((id) => ({ id, isBot: false })),
      ...bots.map((bot) => ({ id: bot.id, isBot: true, bot })),
    ];
    for (const p of allPlayers) this.allPlayerIds.add(p.id);

    const tableCount = Math.max(1, Math.ceil(allPlayers.length / this.config.maxSeatsPerTable));
    const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);
    const chunks: (typeof allPlayers)[] = Array.from({ length: tableCount }, () => []);
    shuffled.forEach((p, i) => chunks[i % tableCount].push(p));

    this.tables = chunks.map((chunk, i) => {
      const room = new PokerTableRoom({
        id: `${this.id}_t${i}`,
        name: `${this.name} - Mesa ${i + 1}`,
        maxSeats: this.config.maxSeatsPerTable,
        blinds: this.config.blindLevels[0],
        mode: "tournament",
        defaultBuyIn: this.config.startingStack,
        bountyPerKnockout: this.config.bountyPerPlayer,
        autoFillBots: false,
        turnTimeMs: 18_000,
        handStartDelayMs: 2500,
        onHandComplete: (r, hand) => this.handleHandComplete(hand),
      });
      for (const p of chunk) {
        if (p.isBot && p.bot) room.seatBot(p.bot, this.config.startingStack);
        else room.addHuman(p.id, this.config.startingStack);
      }
      return room;
    });

    this.levelStartedAt = Date.now();
    this.levelTimer = setInterval(() => this.advanceLevel(), this.config.blindLevels[0].durationSeconds * 1000);
    this.tickTimer = setInterval(() => this.tick(), 5000);

    for (const table of this.tables) table.scheduleStep();
    this.broadcastSummary();
  }

  private advanceLevel(): void {
    if (this.status !== "running") return;
    this.levelIndex = Math.min(this.levelIndex + 1, this.config.blindLevels.length - 1);
    const level = this.config.blindLevels[this.levelIndex];
    for (const table of this.tables) table.setBlinds(level);
    this.levelStartedAt = Date.now();
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = setInterval(() => this.advanceLevel(), level.durationSeconds * 1000);
    this.broadcastSummary();
  }

  private handleHandComplete(hand: Hand): void {
    const finalStacks = hand.getFinalStacks();
    const bustedIds = Object.entries(finalStacks)
      .filter(([, stack]) => stack <= 0)
      .map(([id]) => id);
    if (bustedIds.length === 0) return;

    const publicState = hand.getPublicState();
    const winners = (publicState.showdown ?? [])
      .filter((r) => r.amountWon > 0)
      .sort((a, b) => b.amountWon - a.amountWon);
    const primaryEliminator = winners.find((w) => !bustedIds.includes(w.playerId))?.playerId ?? winners[0]?.playerId;

    for (const bustedId of bustedIds) {
      if (this.eliminations.some((e) => e.playerId === bustedId)) continue;
      const remaining = this.allPlayerIds.size - this.eliminations.length;
      this.eliminations.push({ playerId: bustedId, place: remaining });

      if (primaryEliminator && primaryEliminator !== bustedId) {
        const bounty = this.config.bountyPerPlayer;
        if (!this.botOccupants.has(primaryEliminator)) {
          adjustBalance(primaryEliminator, bounty);
          sendToUser(primaryEliminator, { type: "wallet:balance", balance: getAccount(primaryEliminator)?.balance ?? 0 });
        }
      }

      if (!this.botOccupants.has(bustedId)) {
        sendToUser(bustedId, {
          type: "tournament:eliminated",
          tournamentId: this.id,
          place: remaining,
          bountyEarned: 0,
        });
      } else {
        const bot = this.botOccupants.get(bustedId);
        if (bot) releaseBot(bot);
        this.botOccupants.delete(bustedId);
      }
    }
  }

  private tick(): void {
    if (this.status !== "running") return;
    this.rebalanceTables();
    this.maybeFinish();
    this.broadcastSummary();
  }

  private activeTables(): PokerTableRoom[] {
    return this.tables.filter((t) => t.getSeats().length > 0);
  }

  private rebalanceTables(): void {
    const active = this.activeTables().filter((t) => t.currentHand() === null || t.currentHand()!.isComplete());
    if (active.length < 2) return;

    const totalRemaining = active.reduce((sum, t) => sum + t.getSeats().length, 0);
    if (totalRemaining <= this.config.maxSeatsPerTable && active.length > 1) {
      const [target, ...rest] = active.sort((a, b) => b.getSeats().length - a.getSeats().length);
      for (const table of rest) {
        for (const seat of table.getSeats()) {
          const occupant = table.removeOccupant(seat.id);
          if (!occupant) continue;
          if (this.botOccupants.has(seat.id)) target.seatBot(this.botOccupants.get(seat.id)!, seat.stack);
          else target.addHuman(seat.id, seat.stack);
        }
        table.close();
      }
      this.tables = this.tables.filter((t) => t === target || !rest.includes(t));
      target.scheduleStep();
      return;
    }

    const sorted = [...active].sort((a, b) => b.getSeats().length - a.getSeats().length);
    const fullest = sorted[0];
    const emptiest = sorted[sorted.length - 1];
    if (fullest !== emptiest && fullest.getSeats().length - emptiest.getSeats().length > 1) {
      const seat = fullest.getSeats()[0];
      const occupant = fullest.removeOccupant(seat.id);
      if (occupant) {
        if (this.botOccupants.has(seat.id)) emptiest.seatBot(this.botOccupants.get(seat.id)!, seat.stack);
        else emptiest.addHuman(seat.id, seat.stack);
        emptiest.scheduleStep();
      }
    }
  }

  private maybeFinish(): void {
    const active = this.activeTables();
    const totalRemaining = active.reduce((sum, t) => sum + t.getSeats().length, 0);
    if (totalRemaining > 1) return;
    this.status = "finished";
    if (this.levelTimer) clearInterval(this.levelTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);

    const winnerId = active[0]?.getSeats()[0]?.id;
    const prizePool = this.registeredHumans.size * this.config.buyIn;
    const placements = [...this.eliminations].sort((a, b) => a.place - b.place);
    if (winnerId) placements.unshift({ playerId: winnerId, place: 1 });

    const payoutPct = [0.6, 0.25, 0.15];
    placements.slice(0, 3).forEach((p, i) => {
      if (this.botOccupants.has(p.playerId)) return;
      const amount = Math.round(prizePool * (payoutPct[i] ?? 0));
      if (amount > 0) {
        adjustBalance(p.playerId, amount);
        sendToUser(p.playerId, { type: "wallet:balance", balance: getAccount(p.playerId)?.balance ?? 0 });
        sendToUser(p.playerId, { type: "tournament:eliminated", tournamentId: this.id, place: p.place, bountyEarned: amount });
      }
    });

    for (const table of this.tables) table.close();
    this.broadcastSummary();
  }

  private broadcastSummary(): void {
    // Lobby broadcast is pulled by RoomManager on demand; nothing to push directly here.
  }

  getSummary(): TournamentSummary {
    const active = this.activeTables();
    const remaining = this.status === "registering" ? this.registeredHumans.size : active.reduce((s, t) => s + t.getSeats().length, 0);
    const totalStack = active.reduce((s, t) => s + t.getSeats().reduce((ss, seat) => ss + seat.stack, 0), 0);
    const level = this.config.blindLevels[this.levelIndex];
    const elapsedMs = this.levelStartedAt ? Date.now() - this.levelStartedAt : 0;
    const nextLevelInSeconds = this.levelStartedAt
      ? Math.max(0, level.durationSeconds - Math.floor(elapsedMs / 1000))
      : level.durationSeconds;

    return {
      id: this.id,
      name: this.name,
      kind: "tournament",
      stakes: `Buy-in $${this.config.buyIn}`,
      maxSeats: this.config.maxSeatsPerTable,
      playersSeated: remaining,
      status: this.status,
      playersRemaining: remaining,
      totalEntrants: this.status === "registering" ? this.registeredHumans.size : this.allPlayerIds.size,
      bountyPerKnockout: this.config.bountyPerPlayer,
      currentLevel: this.levelIndex + 1,
      nextLevelInSeconds,
      avgStack: remaining > 0 ? Math.round(totalStack / remaining) : this.config.startingStack,
    };
  }

  getTableForUser(userId: string): PokerTableRoom | undefined {
    return this.tables.find((t) => t.seatedUserIds().includes(userId));
  }

  isRegistered(userId: string): boolean {
    return this.registeredHumans.has(userId);
  }
}
