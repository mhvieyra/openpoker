import { randomUUID } from "node:crypto";

// In-memory account + wallet store. Play-money balances only; resets on process restart.
// Swap for Postgres/Prisma later without touching callers (same function signatures).

export interface Account {
  userId: string;
  displayName: string;
  sessionToken: string;
  balance: number;
  createdAt: number;
}

const STARTING_BALANCE = 20_000;
const accountsById = new Map<string, Account>();
const accountsByToken = new Map<string, string>();
const accountsByName = new Map<string, string>();

export function loginOrCreate(displayName: string, sessionToken?: string): Account {
  if (sessionToken) {
    const userId = accountsByToken.get(sessionToken);
    if (userId) {
      const account = accountsById.get(userId);
      if (account) return account;
    }
  }

  const key = displayName.trim().toLowerCase();
  const existingId = accountsByName.get(key);
  if (existingId) {
    const account = accountsById.get(existingId)!;
    return account;
  }

  const account: Account = {
    userId: randomUUID(),
    displayName: displayName.trim(),
    sessionToken: randomUUID(),
    balance: STARTING_BALANCE,
    createdAt: Date.now(),
  };
  accountsById.set(account.userId, account);
  accountsByToken.set(account.sessionToken, account.userId);
  accountsByName.set(key, account.userId);
  return account;
}

export function getAccount(userId: string): Account | undefined {
  return accountsById.get(userId);
}

export function adjustBalance(userId: string, delta: number): number {
  const account = accountsById.get(userId);
  if (!account) throw new Error("Unknown account");
  account.balance = Math.max(0, account.balance + delta);
  return account.balance;
}

/** Play-money accounts never truly go broke: a small free top-up keeps the game going. */
export function ensureMinimumBalance(userId: string, minimum: number): number {
  const account = accountsById.get(userId);
  if (!account) throw new Error("Unknown account");
  if (account.balance < minimum) {
    account.balance = minimum;
  }
  return account.balance;
}
