import { WebSocketServer } from "ws";
import type { Server } from "node:http";
import type { RoomManager } from "../game/RoomManager.js";
import { attachClient } from "./handler.js";

export function createWsServer(httpServer: Server, roomManager: RoomManager): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (socket) => {
    const client = attachClient(socket, roomManager);
    socket.on("message", (raw) => client.onMessage(raw.toString()));
    socket.on("close", client.onClose);
  });

  return wss;
}
