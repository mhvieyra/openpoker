import { Hand } from "./hand.js";
import type { SeatInput } from "./types.js";

export interface TableSeat {
  id: string;
  seatIndex: number;
  stack: number;
  isBot: boolean;
  sittingOut: boolean;
}

export interface BlindLevel {
  smallBlind: number;
  bigBlind: number;
  ante: number;
  durationSeconds: number;
}

export interface TableEngineConfig {
  maxSeats: number;
  blinds: BlindLevel;
  rng?: () => number;
}

let handCounter = 0;

/** Wraps repeated hands at one table: seat management, button rotation, blind level. */
export class TableEngine {
  readonly maxSeats: number;
  private seats: Map<number, TableSeat> = new Map();
  private buttonSeatIndex: number | null = null;
  private blinds: BlindLevel;
  private rng: () => number;
  currentHand: Hand | null = null;

  constructor(config: TableEngineConfig) {
    this.maxSeats = config.maxSeats;
    this.blinds = config.blinds;
    this.rng = config.rng ?? Math.random;
  }

  setBlinds(level: BlindLevel): void {
    this.blinds = level;
  }

  getBlinds(): BlindLevel {
    return this.blinds;
  }

  seatPlayer(id: string, stack: number, isBot: boolean, preferredSeat?: number): number {
    const seatIndex = preferredSeat ?? this.firstOpenSeat();
    if (seatIndex === null || this.seats.has(seatIndex)) {
      const open = this.firstOpenSeat();
      if (open === null) throw new Error("Table is full");
      this.seats.set(open, { id, seatIndex: open, stack, isBot, sittingOut: false });
      return open;
    }
    this.seats.set(seatIndex, { id, seatIndex, stack, isBot, sittingOut: false });
    return seatIndex;
  }

  removePlayer(id: string): void {
    for (const [idx, seat] of this.seats) {
      if (seat.id === id) {
        this.seats.delete(idx);
        return;
      }
    }
  }

  setSittingOut(id: string, sittingOut: boolean): void {
    const seat = this.findSeat(id);
    if (seat) seat.sittingOut = sittingOut;
  }

  private firstOpenSeat(): number | null {
    for (let i = 0; i < this.maxSeats; i++) {
      if (!this.seats.has(i)) return i;
    }
    return null;
  }

  private findSeat(id: string): TableSeat | undefined {
    return [...this.seats.values()].find((s) => s.id === id);
  }

  getSeats(): TableSeat[] {
    return [...this.seats.values()].sort((a, b) => a.seatIndex - b.seatIndex);
  }

  activePlayerCount(): number {
    return this.getSeats().filter((s) => !s.sittingOut && s.stack > 0).length;
  }

  canStartHand(): boolean {
    const noHandInProgress = this.currentHand === null || this.currentHand.isComplete();
    return this.activePlayerCount() >= 2 && noHandInProgress;
  }

  /** Starts a new hand, rotating the button among active seats. Syncs stacks from the previous hand first. */
  startHand(): Hand {
    if (this.currentHand && !this.currentHand.isComplete()) {
      throw new Error("Previous hand is not complete yet");
    }
    if (this.currentHand) this.syncStacksFromHand(this.currentHand);

    const eligible = this.getSeats().filter((s) => !s.sittingOut && s.stack > 0);
    if (eligible.length < 2) throw new Error("Not enough players to start a hand");

    this.buttonSeatIndex = this.nextButtonSeatIndex(eligible);

    const seatInputs: SeatInput[] = eligible.map((s) => ({
      id: s.id,
      seatIndex: s.seatIndex,
      stack: s.stack,
      isBot: s.isBot,
    }));

    handCounter += 1;
    const hand = new Hand({
      handId: `h_${Date.now()}_${handCounter}`,
      seats: seatInputs,
      buttonSeatIndex: this.buttonSeatIndex,
      smallBlind: this.blinds.smallBlind,
      bigBlind: this.blinds.bigBlind,
      ante: this.blinds.ante,
      rng: this.rng,
    });
    this.currentHand = hand;
    return hand;
  }

  private nextButtonSeatIndex(eligible: TableSeat[]): number {
    const indices = eligible.map((s) => s.seatIndex).sort((a, b) => a - b);
    if (this.buttonSeatIndex === null) return indices[0];
    const pos = indices.findIndex((i) => i > this.buttonSeatIndex!);
    return pos === -1 ? indices[0] : indices[pos];
  }

  /** Pulls final stacks from a completed hand back into persistent seat state, removing busted players. */
  syncStacksFromHand(hand: Hand): void {
    const stacks = hand.getFinalStacks();
    for (const [id, stack] of Object.entries(stacks)) {
      const seat = this.findSeat(id);
      if (seat) seat.stack = stack;
    }
  }

  bustedPlayerIds(): string[] {
    return this.getSeats().filter((s) => s.stack <= 0).map((s) => s.id);
  }
}
