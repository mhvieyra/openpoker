import { TableEngine, type Hand, type BlindLevel, type ActionType, type TableSeat } from "@openpoker/engine";
import type { TableSummary } from "@openpoker/shared";
import { checkoutBot, releaseBot, type SeatedBot } from "../bot/identity.js";
import { decideBotAction } from "../bot/ai.js";
import { sendToUser } from "../ws/connections.js";
import { adjustBalance, getAccount } from "../store.js";

type Occupant = { kind: "human"; userId: string } | { kind: "bot"; bot: SeatedBot };

export interface TableRoomConfig {
  id: string;
  name: string;
  maxSeats: number;
  blinds: BlindLevel;
  mode: "cash" | "tournament";
  defaultBuyIn: number;
  bountyPerKnockout?: number;
  autoFillBots: boolean;
  minPlayersToKeepLively?: number;
  turnTimeMs?: number;
  handStartDelayMs?: number;
  onHandComplete?: (room: PokerTableRoom, hand: Hand) => void;
  onEmpty?: (room: PokerTableRoom) => void;
}

const RESULT_DISPLAY_MS = 3200;

export class PokerTableRoom {
  readonly id: string;
  readonly name: string;
  readonly mode: "cash" | "tournament";
  readonly maxSeats: number;
  private table: TableEngine;
  private occupants = new Map<string, Occupant>();
  private pendingLeaves = new Set<string>();
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduledForPlayerId: string | null = null;
  private stepScheduled = false;
  private closed = false;
  private config: TableRoomConfig;

  constructor(config: TableRoomConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.mode = config.mode;
    this.maxSeats = config.maxSeats;
    this.table = new TableEngine({ maxSeats: config.maxSeats, blinds: config.blinds });
  }

  setBlinds(level: BlindLevel): void {
    this.table.setBlinds(level);
  }

  getBlinds(): BlindLevel {
    return this.table.getBlinds();
  }

  getSeats(): TableSeat[] {
    return this.table.getSeats();
  }

  humanCount(): number {
    return [...this.occupants.values()].filter((o) => o.kind === "human").length;
  }

  seatedUserIds(): string[] {
    return [...this.occupants.values()].filter((o) => o.kind === "human").map((o) => (o as { userId: string }).userId);
  }

  addHuman(userId: string, buyIn: number): number {
    const seatIndex = this.table.seatPlayer(userId, buyIn, false);
    this.occupants.set(userId, { kind: "human", userId });
    this.maybeFillWithBots();
    this.scheduleStep();
    return seatIndex;
  }

  /** Cashes the player's current stack back to their wallet and removes them from the table. */
  removeHuman(userId: string): void {
    const hand = this.table.currentHand;
    const isInHand = hand && !hand.isComplete() && this.table.getSeats().some((s) => s.id === userId);
    if (isInHand) {
      // Removing the seat mid-hand would leave the hand's turn queue pointing at a player the
      // room no longer knows about, freezing the table forever. Defer the actual removal until
      // the hand resolves; auto-fold immediately if it's their turn right now.
      this.pendingLeaves.add(userId);
      if (hand!.getToActPlayerId() === userId) {
        this.clearTurnTimer();
        const options = hand!.getActionOptions(userId);
        const fallback = options.find((o) => o.type === "check") ? "check" : "fold";
        try {
          hand!.applyAction(userId, fallback, 0);
        } catch {
          // already resolved by another path; ignore
        }
        this.broadcastState();
        this.stepTurn();
      }
      return;
    }
    this.finishRemovingHuman(userId);
  }

  private finishRemovingHuman(userId: string): void {
    const seat = this.table.getSeats().find((s) => s.id === userId);
    if (seat) {
      adjustBalance(userId, seat.stack);
      this.table.removePlayer(userId);
    }
    this.occupants.delete(userId);
    this.pendingLeaves.delete(userId);
    if (this.humanCount() === 0 && this.config.mode === "cash") {
      this.config.onEmpty?.(this);
    }
  }

  private maybeFillWithBots(): void {
    if (!this.config.autoFillBots) return;
    const target = this.config.minPlayersToKeepLively ?? Math.min(5, this.maxSeats);
    while (this.table.getSeats().length < target && this.table.getSeats().length < this.maxSeats) {
      const bot = checkoutBot();
      this.table.seatPlayer(bot.id, this.config.defaultBuyIn, true);
      this.occupants.set(bot.id, { kind: "bot", bot });
    }
  }

  seatBot(bot: SeatedBot, stack: number, seatIndex?: number): number {
    const idx = this.table.seatPlayer(bot.id, stack, true, seatIndex);
    this.occupants.set(bot.id, { kind: "bot", bot });
    return idx;
  }

  removeOccupant(playerId: string): TableSeat | undefined {
    const seat = this.table.getSeats().find((s) => s.id === playerId);
    const occupant = this.occupants.get(playerId);
    if (occupant?.kind === "bot") releaseBot(occupant.bot);
    this.table.removePlayer(playerId);
    this.occupants.delete(playerId);
    return seat;
  }

  setSittingOut(userId: string, sittingOut: boolean): void {
    this.table.setSittingOut(userId, sittingOut);
  }

  currentHand(): Hand | null {
    return this.table.currentHand;
  }

  isRunning(): boolean {
    return this.stepScheduled || this.table.currentHand !== null;
  }

  scheduleStep(): void {
    if (this.closed) return;
    if (this.table.currentHand && !this.table.currentHand.isComplete()) {
      this.stepTurn();
      return;
    }
    if (this.table.canStartHand() && !this.stepScheduled) {
      this.stepScheduled = true;
      setTimeout(() => {
        this.stepScheduled = false;
        if (this.closed) return;
        if (!this.table.canStartHand()) return;
        const hand = this.table.startHand();
        this.broadcastState();
        this.dealHoleCardsToHumans(hand);
        this.stepTurn();
      }, this.config.handStartDelayMs ?? 2200);
    }
  }

  private dealHoleCardsToHumans(hand: Hand): void {
    for (const [playerId, occupant] of this.occupants) {
      if (occupant.kind !== "human") continue;
      const cards = hand.getPlayerHoleCards(playerId);
      if (cards.length === 0) continue;
      sendToUser(occupant.userId, {
        type: "table:hole_cards",
        tableId: this.id,
        cards: cards.map((c) => `${c.rank}${c.suit}`),
      });
    }
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.scheduledForPlayerId = null;
  }

  private stepTurn(): void {
    const hand = this.table.currentHand;
    if (!hand) return;
    if (hand.isComplete()) {
      this.handleHandComplete(hand);
      return;
    }

    const toActId = hand.getToActPlayerId();
    if (!toActId) {
      // Betting round auto-advanced (e.g. everyone all-in); re-check shortly for showdown completion.
      setTimeout(() => this.stepTurn(), 900);
      return;
    }

    // A timer is already pending for this exact turn (e.g. a seat change re-triggered
    // scheduleStep mid-hand) — never schedule a second one for the same turn.
    if (this.scheduledForPlayerId === toActId) return;

    const occupant = this.occupants.get(toActId);
    if (!occupant) return;

    if (occupant.kind === "bot") {
      const options = hand.getActionOptions(toActId);
      const decision = decideBotAction({
        personality: occupant.bot.personality,
        hole: hand.getPlayerHoleCards(toActId),
        state: hand.getPublicState(),
        options,
        myPlayerId: toActId,
        myStack: this.table.getSeats().find((s) => s.id === toActId)?.stack ?? 0,
      });
      this.scheduledForPlayerId = toActId;
      this.turnTimer = setTimeout(() => {
        this.scheduledForPlayerId = null;
        if (hand.isComplete() || hand.getToActPlayerId() !== toActId) return;
        try {
          hand.applyAction(toActId, decision.type, decision.amount);
        } catch {
          try {
            hand.applyAction(toActId, "fold", 0);
          } catch {
            // Turn moved on for reasons outside this decision; nothing more to do here.
          }
        }
        this.broadcastState();
        this.stepTurn();
      }, decision.thinkTimeMs);
      return;
    }

    // Human to act: broadcast state (client renders their action clock) and set an auto-fold/check timeout.
    this.broadcastState();
    const turnTimeMs = this.config.turnTimeMs ?? 20_000;
    this.scheduledForPlayerId = toActId;
    this.turnTimer = setTimeout(() => {
      this.scheduledForPlayerId = null;
      if (hand.isComplete() || hand.getToActPlayerId() !== toActId) return;
      const options = hand.getActionOptions(toActId);
      const fallback = options.find((o) => o.type === "check") ? "check" : "fold";
      try {
        hand.applyAction(toActId, fallback, 0);
      } catch {
        // Turn moved on for reasons outside this timeout; nothing more to do here.
      }
      this.broadcastState();
      this.stepTurn();
    }, turnTimeMs);
  }

  handleClientAction(userId: string, type: ActionType, amount?: number): void {
    const hand = this.table.currentHand;
    if (!hand || hand.isComplete()) return;
    if (hand.getToActPlayerId() !== userId) return;
    this.clearTurnTimer();
    hand.applyAction(userId, type, amount ?? 0);
    this.broadcastState();
    this.stepTurn();
  }

  private handleHandComplete(hand: Hand): void {
    this.clearTurnTimer();
    this.broadcastState();
    this.config.onHandComplete?.(this, hand);

    setTimeout(() => {
      if (this.closed) return;
      this.table.syncStacksFromHand(hand);
      this.settleBusted();
      this.scheduleStep();
    }, RESULT_DISPLAY_MS);
  }

  private settleBusted(): void {
    for (const userId of [...this.pendingLeaves]) {
      this.finishRemovingHuman(userId);
    }

    const busted = this.table.bustedPlayerIds();
    for (const playerId of busted) {
      const occupant = this.occupants.get(playerId);
      if (!occupant) continue;
      if (occupant.kind === "bot") {
        // Bots represent the house's other seats; keep the table lively with a fresh buy-in.
        this.table.removePlayer(playerId);
        this.occupants.delete(playerId);
        releaseBot(occupant.bot);
        continue;
      }
      if (this.config.mode === "tournament") {
        // Elimination handled by the tournament room via onHandComplete; just drop the seat here.
        this.table.removePlayer(playerId);
        this.occupants.delete(playerId);
        continue;
      }
      // Cash game: offer an automatic rebuy from the wallet, play money style.
      const account = getAccount(playerId);
      if (account && account.balance >= this.config.defaultBuyIn) {
        adjustBalance(playerId, -this.config.defaultBuyIn);
        this.table.removePlayer(playerId);
        this.table.seatPlayer(playerId, this.config.defaultBuyIn, false);
      } else {
        this.removeHuman(playerId);
      }
    }
    this.maybeFillWithBots();
  }

  broadcastState(): void {
    const hand = this.table.currentHand;
    const state = hand ? hand.getPublicState() : null;
    for (const [playerId, occupant] of this.occupants) {
      if (occupant.kind !== "human") continue;
      sendToUser(occupant.userId, { type: "table:state", tableId: this.id, state: this.serializeFor(playerId, state) });
    }
  }

  private serializeFor(viewerId: string, state: ReturnType<Hand["getPublicState"]> | null) {
    return {
      tableId: this.id,
      name: this.name,
      mode: this.mode,
      maxSeats: this.maxSeats,
      blinds: this.getBlinds(),
      bountyPerKnockout: this.config.bountyPerKnockout ?? null,
      seats: this.table.getSeats().map((s) => {
        const occupant = this.occupants.get(s.id);
        return {
          seatIndex: s.seatIndex,
          playerId: s.id,
          displayName: occupant?.kind === "bot" ? occupant.bot.identity.username : getAccount(s.id)?.displayName ?? s.id,
          isBot: s.isBot,
          stack: s.stack,
          sittingOut: s.sittingOut,
          isYou: s.id === viewerId,
        };
      }),
      hand: state,
      actionOptions: this.table.currentHand && this.table.currentHand.getToActPlayerId() === viewerId
        ? this.table.currentHand.getActionOptions(viewerId)
        : [],
    };
  }

  getSummary(): TableSummary {
    const blinds = this.getBlinds();
    return {
      id: this.id,
      name: this.name,
      kind: this.mode,
      stakes: `${blinds.smallBlind}/${blinds.bigBlind}`,
      maxSeats: this.maxSeats,
      playersSeated: this.table.getSeats().length,
      avgStack: Math.round(
        this.table.getSeats().reduce((sum, s) => sum + s.stack, 0) / Math.max(1, this.table.getSeats().length),
      ),
    };
  }

  close(): void {
    this.closed = true;
    this.clearTurnTimer();
  }
}
