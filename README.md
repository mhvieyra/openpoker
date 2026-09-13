# OpenPoker Club

Plataforma personal de Texas Hold'em No Limit: bots con nombres, avatares e IA
realistas, mesas de cash y torneos Knockout/Bounty, y soporte para jugar varias mesas
en simultáneo desde el navegador. Pensada para uso individual contra bots, no para
publicarse ni para que la usen terceros.

## Arquitectura

Monorepo con npm workspaces:

```
packages/engine   -> motor de poker puro en TypeScript (cartas, evaluador de manos,
                      máquina de estados de una mano NLHE, side pots, showdown)
packages/shared   -> protocolo WebSocket (zod), pools de identidades de bots
apps/server       -> servidor de juego (Node + ws): mesas de cash, torneos Knockout,
                      IA de los bots, wallet en memoria. Se despliega en Railway/Fly.io
                      (necesita conexiones WebSocket persistentes, que Vercel no soporta).
apps/web          -> frontend Next.js (lobby, mesa, multi-mesa). Se despliega en Vercel.
```

El frontend habla con el servidor de juego por un único WebSocket (`/ws`), y un mismo
jugador puede tener varias mesas abiertas a la vez (multi-tabling) porque todo corre
sobre esa misma conexión.

## Desarrollo local

```bash
npm install
npm run build --workspace packages/engine
npm run build --workspace packages/shared

# Terminal 1: servidor de juego (puerto 8080)
npm run dev:server

# Terminal 2: frontend (puerto 3000)
npm run dev:web
```

Abrí `http://localhost:3000`, elegí un nombre y sentate en una mesa. Las mesas se
rellenan solas con bots para que siempre haya partida.

Tests del motor de poker:

```bash
npm run build --workspace packages/engine
node --test packages/engine/dist/*.test.js
```

## Deploy

### 1. Servidor de juego (Railway o Fly.io)

El servidor necesita un proceso persistente con WebSockets, por eso va aparte de Vercel.

**Railway:**
1. Creá un proyecto nuevo desde este repo.
2. Configurá el *Root Directory* en `apps/server` (Railway detecta el `Dockerfile` y lo
   usa para el build automáticamente).
3. Variable de entorno `PORT` la define Railway solo; no hace falta tocarla.
4. Una vez desplegado, copiá la URL pública (algo como `openpoker-server-production.up.railway.app`).

**Fly.io** (alternativa, usando el `fly.toml` incluido en `apps/server`):
```bash
cd apps/server
fly launch --no-deploy   # usa el fly.toml existente, no lo pises
fly deploy
```

### 2. Frontend (Vercel)

1. Importá el repo en Vercel.
2. En **Project Settings → General → Root Directory**, poné `apps/web`. Vercel detecta
   automáticamente que es un monorepo con npm workspaces e instala las dependencias
   desde la raíz del repo.
3. En **Environment Variables**, agregá:
   - `NEXT_PUBLIC_WS_URL` = `wss://<tu-servidor-de-juego>/ws` (la URL de Railway/Fly del
     paso anterior, con esquema `wss://` y el path `/ws`).
4. Deploy. Framework preset: Next.js (autodetectado).

Sin `NEXT_PUBLIC_WS_URL`, el frontend intenta conectarse a `ws://localhost:8080/ws`
(sirve solo para desarrollo local).

## Alcance y límites de esta versión

- **Wallet en memoria**: los saldos y las mesas viven en la memoria del proceso del
  servidor; se resetean si el servidor se reinicia. Para persistencia real, reemplazar
  `apps/server/src/store.ts` por Postgres (Neon/Supabase) detrás de la misma interfaz
  (`loginOrCreate`, `getAccount`, `adjustBalance`) sin tocar el resto del código.
- **Balanceo de mesas en torneos**: implementado de forma simple (mueve un jugador a la
  vez cuando una mesa tiene más de un jugador de diferencia con otra, y consolida mesas
  cuando el campo entra en una sola). Funciona bien para torneos chicos/medianos.
- **Autenticación**: login rápido por nombre de usuario, sin contraseña (pensado para una
  plataforma de práctica). Para producción real, sumar un proveedor de auth (NextAuth,
  Clerk, etc.) delante de `loginOrCreate`.
- No hay integración de pagos reales en ningún archivo del repo: es una app de un solo
  jugador contra bots, sin usuarios ni dinero real involucrados.
- **Avatares**: se generan con la API pública de DiceBear a partir del nombre de cada bot;
  si no hay conexión a esa API, cada avatar cae automáticamente a un círculo de color con
  iniciales (no rompe la mesa).
