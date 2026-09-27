import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OWNER, startTestApp } from "./helpers.js";

const CUSTOMER = 1;
const SELLER = 2;
let t: Awaited<ReturnType<typeof startTestApp>>;

beforeEach(async () => {
  t = await startTestApp();
});
afterEach(() => t.close());

const order = { items: [{ id: 1, quantity: 1 }], fulfillment: "pickup", payment: "cash", name: "Ali", phone: "901234567" };

describe("public", () => {
  it("serves the catalog without login, hiding inactive products", async () => {
    t.store.catalog.updateProduct(5, { active: false });
    const { json } = await t.call("GET", "/api/catalog");
    expect(json.categories.map((c: { name: string }) => c.name)).toEqual(["Kir yuvish", "Idish yuvish", "Sovun", "Tozalash"]);
    expect(json.products).toHaveLength(18);
    expect(json.products[0]).toEqual({ id: 1, title: "Pushti Nexx (Extra)", titleCyr: "Пушти Некс (Экстра)", price: 70000, image: "/img/products/1.webp", categoryId: 1, stock: null });
    expect(json.shop).toEqual({ phone: "", pickupAddress: "", pickupHours: "9:00 – 20:00", deliveryFee: 0 });
  });
});

describe("customer", () => {
  it("requires Telegram login", async () => {
    expect((await t.call("GET", "/api/me")).status).toBe(401);
    expect((await t.call("POST", "/api/orders", { body: order })).status).toBe(401);
  });

  it("places, lists and cancels their own orders", async () => {
    const placed = await t.call("POST", "/api/orders", { as: CUSTOMER, body: order });
    expect(placed.status).toBe(201);

    const mine = await t.call("GET", "/api/orders", { as: CUSTOMER });
    expect(mine.json.map((o: { id: number }) => o.id)).toEqual([placed.json.id]);
    expect((await t.call("GET", "/api/orders", { as: 99 })).json).toEqual([]);

    const cancelled = await t.call("POST", `/api/orders/${placed.json.id}/status`, { as: CUSTOMER, body: { status: "cancelled" } });
    expect(cancelled.json.status).toBe("cancelled");
  });

  it("remembers the script and the profile", async () => {
    await t.call("POST", "/api/orders", { as: CUSTOMER, body: order });
    await t.call("PATCH", "/api/me", { as: CUSTOMER, body: { script: "cyrl" } });
    expect((await t.call("GET", "/api/me", { as: CUSTOMER })).json).toEqual({
      id: CUSTOMER, name: "Ali", phone: "+998901234567", address: "", script: "cyrl", roles: [],
    });
  });

  it("returns readable errors", async () => {
    const res = await t.call("POST", "/api/orders", { as: CUSTOMER, body: { ...order, phone: "x" } });
    expect(res).toMatchObject({ status: 400, json: { error: "Telefon raqam noto'g'ri." } });
  });
});

describe("staff", () => {
  it("keeps customers out of staff and admin endpoints", async () => {
    await t.call("GET", "/api/me", { as: CUSTOMER });
    expect((await t.call("GET", "/api/staff/orders?status=new", { as: CUSTOMER })).status).toBe(403);
    expect((await t.call("GET", "/api/admin/stats", { as: CUSTOMER })).status).toBe(403);
  });

  it("lets the owner make someone a seller, who then works the queue", async () => {
    await t.call("GET", "/api/me", { as: SELLER }); // the seller opened the app once
    const staff = await t.call("GET", "/api/admin/staff", { as: OWNER });
    expect(staff.json.find((u: { id: number }) => u.id === OWNER)).toMatchObject({ owner: true, roles: ["admin"] });

    expect((await t.call("PUT", `/api/admin/staff/${SELLER}`, { as: OWNER, body: { roles: ["seller"] } })).status).toBe(200);
    expect((await t.call("GET", "/api/admin/stats", { as: SELLER })).status).toBe(403);

    const { json: placed } = await t.call("POST", "/api/orders", { as: CUSTOMER, body: order });
    const queue = await t.call("GET", "/api/staff/orders?status=new,ready", { as: SELLER });
    expect(queue.json.map((o: { id: number }) => o.id)).toEqual([placed.id]);

    const ready = await t.call("POST", `/api/orders/${placed.id}/status`, { as: SELLER, body: { status: "ready" } });
    expect(ready.json.status).toBe("ready");
  });

  it("won't let the owner lose admin", async () => {
    await t.call("GET", "/api/me", { as: OWNER });
    expect((await t.call("PUT", `/api/admin/staff/${OWNER}`, { as: OWNER, body: { roles: ["driver"] } })).status).toBe(400);
  });
});

describe("admin", () => {
  it("creates and edits products", async () => {
    const created = await t.call("POST", "/api/admin/products", {
      as: OWNER,
      body: { title: "Yangi sovun", price: 11000, categoryId: 3, stock: 12, active: true },
    });
    expect(created.status).toBe(201);
    const edited = await t.call("PATCH", `/api/admin/products/${created.json.id}`, { as: OWNER, body: { price: 12000, stock: 0 } });
    expect(edited.json).toMatchObject({ price: 12000, stock: 0, title: "Yangi sovun", titleCyr: "" });

    await t.call("PATCH", `/api/admin/products/1`, { as: OWNER, body: { price: 71000 } });
    expect(t.store.catalog.getProduct(1)?.titleCyr).toBe("Пушти Некс (Экстра)"); // not wiped by a partial edit

    const bad = await t.call("PATCH", `/api/admin/products/${created.json.id}`, { as: OWNER, body: { price: -1 } });
    expect(bad.status).toBe(400);
  });

  it("uploads product photos and replaces the old one", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const first = await t.call("PUT", "/api/admin/products/2/image", { as: OWNER, raw: jpeg, type: "image/jpeg" });
    expect(first.json.image).toMatch(/^\/uploads\/product-2-\d+\.jpg$/);

    const served = await fetch(t.base + first.json.image);
    expect(Buffer.from(await served.arrayBuffer())).toEqual(jpeg);

    await new Promise((r) => setTimeout(r, 5));
    const second = await t.call("PUT", "/api/admin/products/2/image", { as: OWNER, raw: jpeg, type: "image/jpeg" });
    expect(fs.readdirSync(t.uploadsDir)).toEqual([path.basename(second.json.image)]);

    const notImage = await t.call("PUT", "/api/admin/products/2/image", { as: OWNER, raw: Buffer.from("hello"), type: "image/png" });
    expect(notImage.status).toBe(400);
  });

  it("manages categories and settings", async () => {
    const { json: category } = await t.call("POST", "/api/admin/categories", { as: OWNER, body: { name: "Shampun" } });
    await t.call("PATCH", `/api/admin/categories/${category.id}`, { as: OWNER, body: { name: "Shampunlar" } });
    expect((await t.call("GET", "/api/catalog")).json.categories.at(-1)).toEqual({ id: category.id, name: "Shampunlar" });

    const settings = await t.call("PATCH", "/api/admin/settings", { as: OWNER, body: { deliveryFee: 15000, phone: "+998 90 000 00 00" } });
    expect(settings.json).toMatchObject({ deliveryFee: 15000, phone: "+998 90 000 00 00" });
    expect((await t.call("GET", "/api/catalog")).json.shop.deliveryFee).toBe(15000);
  });

  it("reports stats", async () => {
    t.store.catalog.updateProduct(1, { stock: 3 });
    const { json: placed } = await t.call("POST", "/api/orders", { as: CUSTOMER, body: order });
    await t.call("POST", `/api/orders/${placed.id}/status`, { as: OWNER, body: { status: "ready" } });
    await t.call("POST", `/api/orders/${placed.id}/status`, { as: OWNER, body: { status: "completed" } });

    const { json } = await t.call("GET", "/api/admin/stats", { as: OWNER });
    expect(json).toMatchObject({
      today: { orders: 1, revenue: 70000 },
      open: { new: 0, ready: 0, delivering: 0 },
      topProducts: [{ title: "Pushti Nexx (Extra)", titleCyr: "Пушти Некс (Экстра)", quantity: 1 }],
      lowStock: [{ id: 1, title: "Pushti Nexx (Extra)", titleCyr: "Пушти Некс (Экстра)", stock: 2 }],
    });
  });
});
