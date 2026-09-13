import { generateBotIdentity, botPersonality, type BotIdentity, type BotPersonality } from "@openpoker/shared";

export interface SeatedBot {
  id: string;
  identity: BotIdentity;
  personality: BotPersonality;
}

const usedNames = new Set<string>();
let seedCounter = 1;
const pool: SeatedBot[] = [];

function createBot(): SeatedBot {
  seedCounter += 1;
  const identity = generateBotIdentity(seedCounter * 7919 + Date.now() % 1000, usedNames);
  return {
    id: `bot_${identity.username}_${seedCounter}`,
    identity,
    personality: botPersonality(identity.archetype),
  };
}

/** Returns a fresh bot not currently seated anywhere (simple pool with reuse once released). */
export function checkoutBot(): SeatedBot {
  const available = pool.pop();
  if (available) return available;
  return createBot();
}

export function releaseBot(bot: SeatedBot): void {
  pool.push(bot);
}
