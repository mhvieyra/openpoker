import { createServer } from "node:http";
import { createWsServer } from "./ws/server.js";
import { RoomManager } from "./game/RoomManager.js";

const PORT = Number(process.env.PORT ?? 8080);

const roomManager = new RoomManager();

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
});

createWsServer(httpServer, roomManager);

httpServer.listen(PORT, () => {
  console.log(`OpenPoker game server listening on :${PORT}`);
});
