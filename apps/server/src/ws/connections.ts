import type { WebSocket } from "ws";
import type { ServerMessage } from "@openpoker/shared";

const socketsByUserId = new Map<string, WebSocket>();

export function registerConnection(userId: string, socket: WebSocket): void {
  socketsByUserId.set(userId, socket);
}

export function removeConnection(userId: string): void {
  socketsByUserId.delete(userId);
}

export function sendToUser(userId: string, message: ServerMessage): void {
  const socket = socketsByUserId.get(userId);
  if (socket && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function isConnected(userId: string): boolean {
  return socketsByUserId.has(userId);
}
