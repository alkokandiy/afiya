import { createHmac } from "node:crypto";
import fs from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/http/app.js";
import type { Button, Message, Notifier } from "../src/notifier.js";
import { OrderService } from "../src/order-service.js";
import { Store } from "../src/store/index.js";

export const BOT_TOKEN = "123456:TEST-token";
export const OWNER = 1000;

export function createStore() {
  return new Store(openDatabase(":memory:"));
}

/** Records messages instead of sending them through Telegram. */
export class FakeNotifier implements Notifier {
  sent: { userId: number; text: string; button?: Button }[] = [];
  async send(userId: number, message: Message, button?: Button) {
    const text = typeof message === "function" ? message(false) : message;
    this.sent.push({ userId, text, button });
  }
  to(userId: number) {
    return this.sent.filter((m) => m.userId === userId).map((m) => m.text);
  }
}

export function createService(store = createStore()) {
  const notifier = new FakeNotifier();
  return { store, notifier, orders: new OrderService(store, notifier, [OWNER]) };
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

export async function startTestApp() {
  const { store, notifier, orders } = createService();
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "afiya-uploads-"));
  const server: Server = createApp(store, orders, { botToken: BOT_TOKEN, ownerIds: [OWNER], uploadsDir }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  /** Calls the API as the given Telegram user (or anonymously with `as: null`). */
  const call = async (method: string, url: string, { as = null as number | null, body = undefined as unknown, raw = undefined as Buffer | undefined, type = "" } = {}) => {
    const headers: Record<string, string> = {};
    if (as !== null) headers.Authorization = `tma ${signInitData({ id: as, first_name: `User${as}` })}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (raw) headers["Content-Type"] = type;
    const res = await fetch(base + url, { method, headers, body: raw ? new Uint8Array(raw) : (body === undefined ? undefined : JSON.stringify(body)) });
    const json = res.headers.get("content-type")?.includes("json") ? await res.json() : undefined;
    return { status: res.status, json: json as any, res };
  };

  const close = () => {
    server.close();
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  };
  return { store, notifier, orders, call, base, uploadsDir, close };
}
