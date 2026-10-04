import { RoomManager } from "@server/game/RoomManager";
import { attachClient } from "@server/ws/handler";

/** What the store needs from a socket; implemented by WebSocket and by LocalSocket. */
export interface GameSocket {
  readyState: number;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  send(data: string): void;
}

let roomManager: RoomManager | null = null;

/**
 * In-browser stand-in for the game server: runs the same rooms, bots and wallet as
 * apps/server, so playing against bots needs no backend. State lives in this tab.
 */
export class LocalSocket implements GameSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  private client: ReturnType<typeof attachClient>;

  constructor() {
    roomManager ??= new RoomManager();
    // The server-side handler only needs `readyState` and `send` to push messages back.
    this.client = attachClient(
      {
        get readyState() {
          return 1;
        },
        send: (data: string) => {
          queueMicrotask(() => this.onmessage?.({ data }));
        },
      },
      roomManager,
    );
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(data: string): void {
    this.client.onMessage(data);
  }
}
