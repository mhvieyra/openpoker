import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import { ClientMessageSchema, type ServerMessage } from "@openpoker/shared";
import { loginOrCreate } from "../store.js";
import { registerConnection, removeConnection, sendToUser } from "./connections.js";
import { RoomManager } from "../game/RoomManager.js";

const lobbySubscribers = new Set<string>();

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function sendLobbySnapshot(userId: string, roomManager: RoomManager): void {
  sendToUser(userId, { type: "lobby:tables", tables: roomManager.listCashTables() });
  sendToUser(userId, { type: "lobby:tournaments", tournaments: roomManager.listTournaments() });
}

export function createWsServer(httpServer: Server, roomManager: RoomManager): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  setInterval(() => {
    for (const userId of lobbySubscribers) sendLobbySnapshot(userId, roomManager);
  }, 4000);

  wss.on("connection", (socket) => {
    let userId: string | null = null;

    socket.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send(socket, { type: "error", message: "Mensaje inválido." });
        return;
      }

      const result = ClientMessageSchema.safeParse(parsed);
      if (!result.success) {
        send(socket, { type: "error", message: "Formato de mensaje inválido." });
        return;
      }
      const msg = result.data;

      if (msg.type === "auth") {
        const account = loginOrCreate(msg.displayName, msg.sessionToken);
        userId = account.userId;
        registerConnection(userId, socket);
        send(socket, { type: "auth:ok", userId: account.userId, displayName: account.displayName, balance: account.balance });
        return;
      }

      if (!userId) {
        send(socket, { type: "error", message: "Autenticate primero." });
        return;
      }

      switch (msg.type) {
        case "lobby:subscribe": {
          lobbySubscribers.add(userId);
          sendLobbySnapshot(userId, roomManager);
          break;
        }
        case "table:join": {
          const result = roomManager.joinCashTable(userId, msg.tableId, msg.buyIn);
          if (!result.ok) send(socket, { type: "error", message: result.error });
          else send(socket, { type: "table:joined", tableId: msg.tableId, seatIndex: result.seatIndex });
          break;
        }
        case "table:leave": {
          roomManager.leaveCashTable(userId, msg.tableId);
          send(socket, { type: "table:left", tableId: msg.tableId });
          break;
        }
        case "table:sit_out": {
          roomManager.findRoomForAction(userId, msg.tableId)?.setSittingOut(userId, true);
          break;
        }
        case "table:sit_in": {
          roomManager.findRoomForAction(userId, msg.tableId)?.setSittingOut(userId, false);
          break;
        }
        case "table:action": {
          const room = roomManager.findRoomForAction(userId, msg.tableId);
          if (!room) {
            send(socket, { type: "error", message: "No estás sentado en esa mesa." });
            break;
          }
          room.handleClientAction(userId, msg.action, msg.amount);
          break;
        }
        case "tournament:register": {
          const result = roomManager.registerTournament(userId, msg.tournamentId);
          if (!result.ok) send(socket, { type: "error", message: result.error });
          break;
        }
        case "ping": {
          send(socket, { type: "pong" });
          break;
        }
      }
    });

    socket.on("close", () => {
      if (userId) {
        lobbySubscribers.delete(userId);
        roomManager.disconnectUser(userId);
        removeConnection(userId);
      }
    });
  });

  return wss;
}
