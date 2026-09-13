import { z } from "zod";

export const ActionTypeSchema = z.enum(["fold", "check", "call", "bet", "raise", "all-in"]);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth"), displayName: z.string().min(2).max(24), sessionToken: z.string().optional() }),
  z.object({ type: z.literal("lobby:subscribe") }),
  z.object({ type: z.literal("table:join"), tableId: z.string(), buyIn: z.number().positive() }),
  z.object({ type: z.literal("table:leave"), tableId: z.string() }),
  z.object({ type: z.literal("table:sit_out"), tableId: z.string() }),
  z.object({ type: z.literal("table:sit_in"), tableId: z.string() }),
  z.object({
    type: z.literal("table:action"),
    tableId: z.string(),
    action: ActionTypeSchema,
    amount: z.number().nonnegative().optional(),
  }),
  z.object({ type: z.literal("tournament:register"), tournamentId: z.string() }),
  z.object({ type: z.literal("ping") }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server -> client messages are produced by trusted code; plain TS types are enough.
export interface TableSummary {
  id: string;
  name: string;
  kind: "cash" | "tournament";
  stakes: string;
  maxSeats: number;
  playersSeated: number;
  avgStack?: number;
}

export interface TournamentSummary extends TableSummary {
  kind: "tournament";
  status: "registering" | "running" | "finished";
  playersRemaining: number;
  totalEntrants: number;
  bountyPerKnockout: number;
  currentLevel: number;
  nextLevelInSeconds: number;
}

export type ServerMessage =
  | { type: "auth:ok"; userId: string; displayName: string; balance: number }
  | { type: "auth:error"; message: string }
  | { type: "lobby:tables"; tables: TableSummary[] }
  | { type: "lobby:tournaments"; tournaments: TournamentSummary[] }
  | { type: "table:joined"; tableId: string; seatIndex: number }
  | { type: "table:left"; tableId: string }
  | { type: "table:state"; tableId: string; state: unknown }
  | { type: "table:hole_cards"; tableId: string; cards: string[] }
  | { type: "table:chat"; tableId: string; playerId: string; message: string }
  | { type: "tournament:update"; tournament: TournamentSummary }
  | { type: "tournament:eliminated"; tournamentId: string; place: number; bountyEarned: number }
  | { type: "wallet:balance"; balance: number }
  | { type: "error"; message: string }
  | { type: "pong" };
