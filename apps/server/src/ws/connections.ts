import type { ServerMessage } from "@openpoker/shared";

/** Minimal socket surface the game needs; satisfied by `ws` sockets and the in-browser loopback. */
export interface ClientSocket {
  readyState: number;
  send(data: string): void;
}

const OPEN = 1;
const socketsByUserId = new Map<string, ClientSocket>();

export function registerConnection(userId: string, socket: ClientSocket): void {
  socketsByUserId.set(userId, socket);
}

export function removeConnection(userId: string): void {
  socketsByUserId.delete(userId);
}

export function sendToUser(userId: string, message: ServerMessage): void {
  const socket = socketsByUserId.get(userId);
  if (socket && socket.readyState === OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function isConnected(userId: string): boolean {
  return socketsByUserId.has(userId);
}
