"use client";

import { create } from "zustand";
import type { TableSummary, TournamentSummary } from "@openpoker/shared";
import { handCategoryLabel } from "./handLabels";

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "all-in";

export interface CardLike {
  rank: number;
  suit: string;
}

export interface SeatView {
  seatIndex: number;
  playerId: string;
  displayName: string;
  isBot: boolean;
  stack: number;
  sittingOut: boolean;
  isYou: boolean;
}

export interface HandView {
  handId: string;
  street: string;
  board: CardLike[];
  pots: { amount: number; eligiblePlayerIds: string[] }[];
  totalPot: number;
  buttonSeatIndex: number;
  toActPlayerId: string | null;
  currentBet: number;
  minRaiseTo: number;
  players: Array<{
    id: string;
    seatIndex: number;
    stack: number;
    betThisStreet: number;
    folded: boolean;
    allIn: boolean;
    holeCardsRevealed: CardLike[] | null;
  }>;
  showdown: Array<{ playerId: string; amountWon: number; handScore?: { category: string } }> | null;
}

export interface ActionOptionView {
  type: ActionType;
  toCall?: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface HandHistoryEntry {
  handId: string;
  summary: string;
  timestamp: number;
}

export interface TableView {
  tableId: string;
  name: string;
  mode: "cash" | "tournament";
  maxSeats: number;
  blinds: { smallBlind: number; bigBlind: number; ante: number };
  bountyPerKnockout: number | null;
  seats: SeatView[];
  hand: HandView | null;
  myHoleCards: string[];
  actionOptions: ActionOptionView[];
  history: HandHistoryEntry[];
}

interface AuthState {
  userId: string;
  displayName: string;
  balance: number;
  sessionToken: string;
}

interface Store {
  connected: boolean;
  connecting: boolean;
  auth: AuthState | null;
  authError: string | null;
  lastError: string | null;
  lobbyTables: TableSummary[];
  lobbyTournaments: TournamentSummary[];
  tables: Record<string, TableView>;
  openTableIds: string[];
  activeTableId: string | null;

  connect: () => void;
  login: (displayName: string) => void;
  joinTable: (tableId: string, buyIn: number) => void;
  leaveTable: (tableId: string) => void;
  closeTab: (tableId: string) => void;
  setActiveTable: (tableId: string) => void;
  sendAction: (tableId: string, action: ActionType, amount?: number) => void;
  registerTournament: (tournamentId: string) => void;
}

let socket: WebSocket | null = null;

function wsUrl(): string {
  const base = process.env.NEXT_PUBLIC_WS_URL;
  if (base) return base;
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://localhost:8080/ws`;
}

export const useStore = create<Store>((set, get) => ({
  connected: false,
  connecting: false,
  auth: null,
  authError: null,
  lastError: null,
  lobbyTables: [],
  lobbyTournaments: [],
  tables: {},
  openTableIds: [],
  activeTableId: null,

  connect: () => {
    if (socket || get().connecting) return;
    set({ connecting: true });
    const ws = new WebSocket(wsUrl());
    socket = ws;

    ws.onopen = () => {
      set({ connected: true, connecting: false });
      const savedName = typeof window !== "undefined" ? localStorage.getItem("openpoker:name") : null;
      const savedToken = typeof window !== "undefined" ? localStorage.getItem("openpoker:token") : undefined;
      if (savedName) {
        ws.send(JSON.stringify({ type: "auth", displayName: savedName, sessionToken: savedToken ?? undefined }));
      }
    };

    ws.onclose = () => {
      socket = null;
      set({ connected: false });
      setTimeout(() => get().connect(), 2000);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg, set, get);
    };
  },

  login: (displayName: string) => {
    if (typeof window !== "undefined") localStorage.setItem("openpoker:name", displayName);
    socket?.send(JSON.stringify({ type: "auth", displayName }));
  },

  joinTable: (tableId, buyIn) => {
    socket?.send(JSON.stringify({ type: "table:join", tableId, buyIn }));
    socket?.send(JSON.stringify({ type: "lobby:subscribe" }));
  },

  leaveTable: (tableId) => {
    socket?.send(JSON.stringify({ type: "table:leave", tableId }));
    get().closeTab(tableId);
  },

  closeTab: (tableId) => {
    set((s) => {
      const openTableIds = s.openTableIds.filter((id) => id !== tableId);
      const activeTableId = s.activeTableId === tableId ? openTableIds[0] ?? null : s.activeTableId;
      return { openTableIds, activeTableId };
    });
  },

  setActiveTable: (tableId) => set({ activeTableId: tableId }),

  sendAction: (tableId, action, amount) => {
    socket?.send(JSON.stringify({ type: "table:action", tableId, action, amount }));
  },

  registerTournament: (tournamentId) => {
    socket?.send(JSON.stringify({ type: "tournament:register", tournamentId }));
  },
}));

function buildHistoryEntry(table: TableView): HandHistoryEntry {
  const hand = table.hand!;
  const winners = (hand.showdown ?? []).filter((r) => r.amountWon > 0);
  const nameFor = (id: string) => table.seats.find((s) => s.playerId === id)?.displayName ?? id;
  const summary = winners
    .map((w) => {
      const cat = handCategoryLabel(w.handScore?.category);
      return `${nameFor(w.playerId)} gana ${w.amountWon}${cat ? ` con ${cat}` : ""}`;
    })
    .join(" · ");
  return { handId: hand.handId, summary, timestamp: Date.now() };
}

function handleServerMessage(
  msg: any,
  set: (partial: Partial<Store> | ((s: Store) => Partial<Store>)) => void,
  get: () => Store,
) {
  switch (msg.type) {
    case "auth:ok": {
      if (typeof window !== "undefined") localStorage.setItem("openpoker:token", msg.userId);
      set({ auth: { userId: msg.userId, displayName: msg.displayName, balance: msg.balance, sessionToken: msg.userId }, authError: null });
      socket?.send(JSON.stringify({ type: "lobby:subscribe" }));
      break;
    }
    case "auth:error": {
      set({ authError: msg.message });
      break;
    }
    case "lobby:tables": {
      set({ lobbyTables: msg.tables });
      break;
    }
    case "lobby:tournaments": {
      set({ lobbyTournaments: msg.tournaments });
      break;
    }
    case "table:joined": {
      set((s) => ({
        openTableIds: s.openTableIds.includes(msg.tableId) ? s.openTableIds : [...s.openTableIds, msg.tableId],
        activeTableId: msg.tableId,
      }));
      break;
    }
    case "table:left": {
      break;
    }
    case "table:state": {
      const incoming = msg.state as TableView;
      set((s) => {
        const previous = s.tables[msg.tableId];
        const sameHand = previous?.hand?.handId && previous.hand.handId === incoming.hand?.handId;
        const history = previous?.history ?? [];
        const alreadyLogged = incoming.hand ? history.some((h) => h.handId === incoming.hand!.handId) : true;
        const nextHistory =
          incoming.hand?.street === "complete" && incoming.hand.showdown && !alreadyLogged
            ? [buildHistoryEntry(incoming), ...history].slice(0, 25)
            : history;
        return {
          tables: {
            ...s.tables,
            [msg.tableId]: {
              ...incoming,
              myHoleCards: sameHand ? previous.myHoleCards : [],
              history: nextHistory,
            },
          },
          openTableIds: s.openTableIds.includes(msg.tableId) ? s.openTableIds : [...s.openTableIds, msg.tableId],
          activeTableId: s.activeTableId ?? msg.tableId,
        };
      });
      break;
    }
    case "table:hole_cards": {
      set((s) => {
        const existing = s.tables[msg.tableId];
        if (!existing) return {};
        return { tables: { ...s.tables, [msg.tableId]: { ...existing, myHoleCards: msg.cards } } };
      });
      break;
    }
    case "wallet:balance": {
      set((s) => (s.auth ? { auth: { ...s.auth, balance: msg.balance } } : {}));
      break;
    }
    case "tournament:eliminated": {
      set({ lastError: msg.bountyEarned > 0 ? `¡Ganaste ${msg.bountyEarned} en el torneo! Puesto ${msg.place}.` : `Quedaste eliminado en el puesto ${msg.place}.` });
      break;
    }
    case "error": {
      set({ lastError: msg.message });
      break;
    }
    default:
      break;
  }
}
