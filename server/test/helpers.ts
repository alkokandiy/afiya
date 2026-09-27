import { createHmac } from "node:crypto";
import type { Api } from "grammy";
import { vi } from "vitest";
import { openDatabase } from "../src/db.js";
import { Store } from "../src/store.js";

export const BOT_TOKEN = "123456:TEST-token";

export function createStore() {
  return new Store(openDatabase(":memory:"));
}

/** A stand-in for grammY's Api that records every message instead of calling Telegram. */
export function createFakeApi() {
  const sent: { chatId: number; text: string; options?: any }[] = [];
  const api = {
    sendMessage: vi.fn(async (chatId: number, text: string, options?: unknown) => {
      sent.push({ chatId, text, options });
      return {};
    }),
    sendLocation: vi.fn(async () => ({})),
  };
  return { api: api as unknown as Api, sent, mock: api };
}

export function signInitData(user: object, { authDate = Math.floor(Date.now() / 1000), token = BOT_TOKEN } = {}) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: "AAE", user: JSON.stringify(user) });
  const dataCheckString = [...params]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return params.toString();
}
