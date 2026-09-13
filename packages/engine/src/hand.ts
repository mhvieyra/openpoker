import { Deck } from "./deck.js";
import { evaluateBestHand, compareHandScores } from "./handEvaluator.js";
import { computePots } from "./pots.js";
import type { Card } from "./card.js";
import type {
  ActionOption,
  ActionType,
  HandPlayerState,
  HandPublicState,
  PlayerAction,
  SeatInput,
  ShowdownResult,
  Street,
} from "./types.js";

export interface HandConfig {
  handId: string;
  seats: SeatInput[];
  buttonSeatIndex: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  rng?: () => number;
}

const STREET_ORDER: Street[] = ["preflop", "flop", "turn", "river", "showdown", "complete"];

export class Hand {
  readonly handId: string;
  private deck: Deck;
  private seatIndexOrder: number[];
  private players: Map<string, HandPlayerState>;
  private buttonSeatIndex: number;
  private smallBlind: number;
  private bigBlind: number;
  private ante: number;

  private street: Street = "preflop";
  private board: Card[] = [];
  private currentBet = 0;
  private minRaiseIncrement: number;
  private queue: string[] = [];
  private streetOrder: string[] = [];
  private actionHistory: PlayerAction[] = [];
  private showdownResult: ShowdownResult[] | null = null;
  private handComplete = false;
  private lastAggressorId: string | null = null;

  constructor(config: HandConfig) {
    this.handId = config.handId;
    this.deck = new Deck(config.rng ?? Math.random);
    this.buttonSeatIndex = config.buttonSeatIndex;
    this.smallBlind = config.smallBlind;
    this.bigBlind = config.bigBlind;
    this.ante = config.ante ?? 0;
    this.minRaiseIncrement = config.bigBlind;

    const seats = [...config.seats]
      .filter((s) => s.stack > 0)
      .sort((a, b) => a.seatIndex - b.seatIndex);
    this.seatIndexOrder = seats.map((s) => s.seatIndex);

    this.players = new Map();
    for (const seat of seats) {
      this.players.set(seat.id, {
        id: seat.id,
        seatIndex: seat.seatIndex,
        startingStack: seat.stack,
        stack: seat.stack,
        holeCards: [],
        betThisStreet: 0,
        totalCommitted: 0,
        folded: false,
        allIn: false,
        isBot: seat.isBot,
      });
    }

    if (this.players.size < 2) {
      throw new Error("A hand requires at least 2 players");
    }

    this.collectAntes();
    this.dealHoleCards();
    this.postBlinds();
    this.startStreet("preflop");
  }

  // ---------- setup helpers ----------

  private idsBySeatOrder(): string[] {
    const bySeat = new Map<number, string>();
    for (const p of this.players.values()) bySeat.set(p.seatIndex, p.id);
    return this.seatIndexOrder.map((s) => bySeat.get(s)!);
  }

  private rotationFrom(startPos: number): string[] {
    const ids = this.idsBySeatOrder();
    const n = ids.length;
    return Array.from({ length: n }, (_, i) => ids[(startPos + i) % n]);
  }

  private collectAntes(): void {
    if (this.ante <= 0) return;
    for (const p of this.players.values()) {
      const amount = Math.min(this.ante, p.stack);
      p.stack -= amount;
      p.totalCommitted += amount;
      if (p.stack === 0) p.allIn = true;
    }
  }

  private dealHoleCards(): void {
    const order = this.idsBySeatOrder();
    for (let round = 0; round < 2; round++) {
      for (const id of order) {
        this.players.get(id)!.holeCards.push(this.deck.draw());
      }
    }
  }

  private postBlinds(): void {
    const n = this.players.size;
    const btnPos = this.seatIndexOrder.indexOf(this.buttonSeatIndex);
    const sbPos = n === 2 ? btnPos : (btnPos + 1) % n;
    const bbPos = n === 2 ? (btnPos + 1) % n : (btnPos + 2) % n;

    const ids = this.idsBySeatOrder();
    const sbPlayer = this.players.get(ids[sbPos])!;
    const bbPlayer = this.players.get(ids[bbPos])!;

    const sbAmount = Math.min(this.smallBlind, sbPlayer.stack);
    sbPlayer.stack -= sbAmount;
    sbPlayer.betThisStreet += sbAmount;
    sbPlayer.totalCommitted += sbAmount;
    if (sbPlayer.stack === 0) sbPlayer.allIn = true;
    this.recordAction(sbPlayer.id, "post-blind", sbAmount);

    const bbAmount = Math.min(this.bigBlind, bbPlayer.stack);
    bbPlayer.stack -= bbAmount;
    bbPlayer.betThisStreet += bbAmount;
    bbPlayer.totalCommitted += bbAmount;
    if (bbPlayer.stack === 0) bbPlayer.allIn = true;
    this.recordAction(bbPlayer.id, "post-blind", bbAmount);

    this.currentBet = bbAmount;
  }

  private firstToActPos(street: Street): number {
    const n = this.players.size;
    const btnPos = this.seatIndexOrder.indexOf(this.buttonSeatIndex);
    if (street === "preflop") {
      return n === 2 ? btnPos : (btnPos + 3) % n; // UTG (after SB, BB)
    }
    return n === 2 ? (btnPos + 1) % n : (btnPos + 1) % n; // SB acts first postflop (heads-up: BB acts first -> btnPos+1 is BB)
  }

  private startStreet(street: Street): void {
    this.street = street;
    if (street !== "preflop") {
      for (const p of this.players.values()) p.betThisStreet = 0;
      this.currentBet = 0;
      this.minRaiseIncrement = this.bigBlind;
      this.lastAggressorId = null;
    }

    const startPos = this.firstToActPos(street);
    const full = this.rotationFrom(startPos);
    this.streetOrder = full.filter((id) => !this.players.get(id)!.folded);
    this.queue = this.streetOrder.filter((id) => {
      const p = this.players.get(id)!;
      return !p.allIn;
    });

    this.maybeAutoRunOut();
  }

  private maybeAutoRunOut(): void {
    const remaining = [...this.players.values()].filter((p) => !p.folded);
    const canAct = remaining.filter((p) => !p.allIn);
    if (remaining.length > 1 && canAct.length <= 1) {
      // No more betting possible: run the board out and go to showdown.
      this.queue = [];
      this.advanceIfRoundClosed(true);
    }
  }

  // ---------- public query API ----------

  getActionOptions(playerId: string): ActionOption[] {
    if (this.queue[0] !== playerId) return [];
    const player = this.players.get(playerId);
    if (!player) return [];

    const toCall = this.currentBet - player.betThisStreet;
    const options: ActionOption[] = [];

    if (toCall <= 0) {
      options.push({ type: "check" });
      if (player.stack > 0) {
        const minBet = Math.min(this.bigBlind, player.stack);
        options.push({ type: "bet", minAmount: minBet, maxAmount: player.stack });
      }
    } else {
      options.push({ type: "fold" });
      const callAmount = Math.min(toCall, player.stack);
      options.push({ type: "call", toCall: callAmount });
      const minRaiseTo = this.currentBet + this.minRaiseIncrement;
      if (player.stack > toCall) {
        options.push({
          type: "raise",
          minAmount: Math.min(minRaiseTo, player.betThisStreet + player.stack),
          maxAmount: player.betThisStreet + player.stack,
        });
      }
    }
    if (player.stack > 0) {
      options.push({ type: "all-in", maxAmount: player.betThisStreet + player.stack });
    }
    return options;
  }

  getToActPlayerId(): string | null {
    return this.queue[0] ?? null;
  }

  // ---------- action application ----------

  applyAction(playerId: string, type: ActionType, amount = 0): void {
    if (this.handComplete) throw new Error("Hand is already complete");
    if (this.queue[0] !== playerId) throw new Error("Not this player's turn");
    const player = this.players.get(playerId);
    if (!player) throw new Error("Unknown player");

    const toCall = this.currentBet - player.betThisStreet;

    switch (type) {
      case "fold": {
        player.folded = true;
        this.recordAction(playerId, "fold", 0);
        this.queue.shift();
        this.checkFoldWin();
        break;
      }
      case "check": {
        if (toCall > 0) throw new Error("Cannot check facing a bet");
        this.recordAction(playerId, "check", 0);
        this.queue.shift();
        break;
      }
      case "call": {
        const callAmount = Math.min(toCall, player.stack);
        this.commit(player, callAmount);
        this.recordAction(playerId, "call", callAmount);
        if (player.stack === 0) player.allIn = true;
        this.queue.shift();
        break;
      }
      case "bet":
      case "raise": {
        const targetTotal = amount; // total bet-to amount this street
        const raiseBy = targetTotal - this.currentBet;
        const committing = targetTotal - player.betThisStreet;
        if (committing > player.stack) throw new Error("Cannot bet more than stack");
        this.commit(player, committing);
        this.recordAction(playerId, type, committing);
        if (raiseBy > 0) this.minRaiseIncrement = raiseBy;
        this.currentBet = targetTotal;
        this.lastAggressorId = playerId;
        if (player.stack === 0) player.allIn = true;
        this.reopenActionAfter(playerId);
        break;
      }
      case "all-in": {
        const committing = player.stack;
        const targetTotal = player.betThisStreet + committing;
        this.commit(player, committing);
        this.recordAction(playerId, "all-in", committing);
        player.allIn = true;
        if (targetTotal > this.currentBet) {
          const raiseBy = targetTotal - this.currentBet;
          const isFullRaise = raiseBy >= this.minRaiseIncrement;
          this.currentBet = targetTotal;
          if (isFullRaise) {
            this.minRaiseIncrement = raiseBy;
            this.lastAggressorId = playerId;
            this.reopenActionAfter(playerId);
          } else {
            // Short all-in: doesn't reopen the action for players who already matched the
            // previous bet, but remaining players in queue still owe the higher amount.
            this.queue.shift();
          }
        } else {
          this.queue.shift();
        }
        break;
      }
      default:
        throw new Error(`Unsupported action type: ${type}`);
    }

    if (!this.handComplete) this.advanceIfRoundClosed(false);
  }

  private commit(player: HandPlayerState, amount: number): void {
    player.stack -= amount;
    player.betThisStreet += amount;
    player.totalCommitted += amount;
  }

  private reopenActionAfter(actorId: string): void {
    const remaining = this.streetOrder.filter((id) => {
      const p = this.players.get(id)!;
      return id !== actorId && !p.folded && !p.allIn;
    });
    const actorPos = this.streetOrder.indexOf(actorId);
    const after = this.streetOrder.slice(actorPos + 1).filter((id) => remaining.includes(id));
    const before = this.streetOrder.slice(0, actorPos).filter((id) => remaining.includes(id));
    this.queue = [...after, ...before];
  }

  private checkFoldWin(): void {
    const stillIn = [...this.players.values()].filter((p) => !p.folded);
    if (stillIn.length === 1) {
      this.awardUncontested(stillIn[0].id);
    }
  }

  private awardUncontested(winnerId: string): void {
    const pots = computePots([...this.players.values()]);
    const totalPot = pots.reduce((sum, pot) => sum + pot.amount, 0);
    const winner = this.players.get(winnerId)!;
    winner.stack += totalPot;
    this.showdownResult = [
      { playerId: winnerId, handScore: { category: "high-card", rank: [0], cards: [] }, amountWon: totalPot, revealed: false },
    ];
    this.street = "complete";
    this.handComplete = true;
    this.queue = [];
  }

  private advanceIfRoundClosed(forceRunOut: boolean): void {
    if (this.handComplete) return;
    if (!forceRunOut && this.queue.length > 0) return;

    const activeCount = [...this.players.values()].filter((p) => !p.folded).length;
    if (activeCount <= 1) return; // handled by checkFoldWin/awardUncontested already

    const canStillAct = [...this.players.values()].filter((p) => !p.folded && !p.allIn).length;

    switch (this.street) {
      case "preflop":
        this.board.push(this.deck.draw(), this.deck.draw(), this.deck.draw());
        this.startStreet("flop");
        break;
      case "flop":
        this.board.push(this.deck.draw());
        this.startStreet("turn");
        break;
      case "turn":
        this.board.push(this.deck.draw());
        this.startStreet("river");
        break;
      case "river":
        this.runShowdown();
        break;
      default:
        break;
    }

    if (canStillAct <= 1 && this.street !== "complete" && this.street !== "showdown") {
      this.maybeAutoRunOut();
    }
  }

  private runShowdown(): void {
    const pots = computePots([...this.players.values()]);
    const results: ShowdownResult[] = [];
    const wonSoFar = new Map<string, number>();

    const btnPos = this.seatIndexOrder.indexOf(this.buttonSeatIndex);
    const seatOrderIds = this.rotationFrom((btnPos + 1) % this.players.size);

    for (const pot of pots) {
      if (pot.eligiblePlayerIds.length === 1) {
        wonSoFar.set(pot.eligiblePlayerIds[0], (wonSoFar.get(pot.eligiblePlayerIds[0]) ?? 0) + pot.amount);
        continue;
      }
      const scored = pot.eligiblePlayerIds.map((id) => {
        const player = this.players.get(id)!;
        const score = evaluateBestHand([...player.holeCards, ...this.board]);
        return { id, score };
      });
      let best = scored[0];
      for (const s of scored.slice(1)) {
        if (compareHandScores(s.score, best.score) > 0) best = s;
      }
      const winners = scored.filter((s) => compareHandScores(s.score, best.score) === 0);
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;

      const winnersInOrder = seatOrderIds.filter((id) => winners.some((w) => w.id === id));
      for (const w of winnersInOrder) {
        let amount = share;
        if (remainder > 0) {
          amount += 1;
          remainder -= 1;
        }
        wonSoFar.set(w, (wonSoFar.get(w) ?? 0) + amount);
      }
    }

    for (const player of this.players.values()) {
      if (player.folded) continue;
      const amountWon = wonSoFar.get(player.id) ?? 0;
      player.stack += amountWon;
      const score = evaluateBestHand([...player.holeCards, ...this.board]);
      results.push({ playerId: player.id, handScore: score, amountWon, revealed: true });
    }

    this.showdownResult = results;
    this.street = "complete";
    this.handComplete = true;
    this.queue = [];
  }

  private recordAction(playerId: string, type: ActionType, amount: number): void {
    this.actionHistory.push({ playerId, type, amount, street: this.street, timestamp: Date.now() });
  }

  // ---------- state export ----------

  isComplete(): boolean {
    return this.handComplete;
  }

  getPlayerHoleCards(playerId: string): Card[] {
    return this.players.get(playerId)?.holeCards ?? [];
  }

  getFinalStacks(): Record<string, number> {
    const stacks: Record<string, number> = {};
    for (const p of this.players.values()) stacks[p.id] = p.stack;
    return stacks;
  }

  getPublicState(): HandPublicState {
    const pots = this.handComplete ? [] : computePots([...this.players.values()]);
    const totalPot = [...this.players.values()].reduce((sum, p) => sum + p.totalCommitted, 0);
    return {
      handId: this.handId,
      street: this.street,
      board: this.board,
      pots,
      totalPot,
      buttonSeatIndex: this.buttonSeatIndex,
      toActPlayerId: this.getToActPlayerId(),
      currentBet: this.currentBet,
      minRaiseTo: this.currentBet + this.minRaiseIncrement,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        seatIndex: p.seatIndex,
        stack: p.stack,
        betThisStreet: p.betThisStreet,
        folded: p.folded,
        allIn: p.allIn,
        holeCardsRevealed:
          this.handComplete && this.showdownResult?.some((r) => r.playerId === p.id && r.revealed)
            ? p.holeCards
            : null,
      })),
      actionHistory: this.actionHistory,
      showdown: this.showdownResult,
    };
  }
}
