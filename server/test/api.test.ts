import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/api.js";
import { Checkout } from "../src/checkout.js";
import type { Store } from "../src/store.js";
import { BOT_TOKEN, createFakeApi, createStore, signInitData } from "./helpers.js";

let server: Server;
let base: string;
let store: Store;

beforeEach(async () => {
  store = createStore();
  const checkout = new Checkout(store, createFakeApi().api, [1]);
  server = createApp(store, checkout, { botToken: BOT_TOKEN }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  server.close();
});

const postCheckout = (body: unknown, auth?: string) =>
  fetch(`${base}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

describe("API", () => {
  it("lists only active products", async () => {
    store.setActive(5, false);
    const products = (await (await fetch(`${base}/api/products`)).json()) as { id: number }[];
    expect(products).toHaveLength(18);
    expect(products.map((p) => p.id)).not.toContain(5);
    expect(products[0]).toEqual({ id: 1, title: "Pushti Nexx (Extra)", price: 70000, image: "/img/products/1.webp" });
  });

  it("rejects checkout without valid Telegram initData", async () => {
    expect((await postCheckout({ items: [{ id: 1, quantity: 1 }] })).status).toBe(401);
    expect((await postCheckout({ items: [{ id: 1, quantity: 1 }] }, "tma forged")).status).toBe(401);
  });

  it("starts checkout for the signed-in user", async () => {
    const res = await postCheckout({ items: [{ id: 1, quantity: 2 }] }, `tma ${signInitData({ id: 55 })}`);
    expect(res.status).toBe(200);
    expect(store.getSession(55)).toMatchObject({ step: "name", items: [{ id: 1, quantity: 2 }] });
  });

  it("returns 400 with a message for bad carts", async () => {
    const res = await postCheckout({ items: [] }, `tma ${signInitData({ id: 55 })}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Savatingiz bo'sh!" });
  });
});
