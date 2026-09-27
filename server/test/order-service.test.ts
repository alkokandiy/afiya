import { beforeEach, describe, expect, it } from "vitest";
import { UserError } from "../src/errors.js";
import { normalizePhone } from "../src/order-service.js";
import { createService, OWNER } from "./helpers.js";

const CUSTOMER = 1;
const SELLER = 2;
const DRIVER = 3;

let ctx: ReturnType<typeof createService>;
const user = (id: number) => ctx.store.users.get(id)!;

const pickupOrder = (extra: object = {}) => ({
  items: [{ id: 3, quantity: 2 }],
  fulfillment: "pickup",
  payment: "cash",
  name: "Dilnoza opa",
  phone: "90 123 45 67",
  ...extra,
});
const deliveryOrder = (extra: object = {}) =>
  pickupOrder({ fulfillment: "delivery", address: "Qo'qon, Navoiy ko'chasi 12", ...extra });

beforeEach(() => {
  ctx = createService();
  for (const [id, name] of [[CUSTOMER, "Dilnoza"], [SELLER, "Onam"], [DRIVER, "Aka"], [OWNER, "Men"]] as const) {
    ctx.store.users.touch(id, name, null);
  }
  ctx.store.users.setRoles(SELLER, ["seller"]);
  ctx.store.users.setRoles(DRIVER, ["driver"]);
});

describe("placing orders", () => {
  it("prices from the database and saves the customer's details", async () => {
    const order = await ctx.orders.place(CUSTOMER, pickupOrder({ items: [{ id: 3, quantity: 2, price: 1 }] }));
    expect(order).toMatchObject({ status: "new", subtotal: 110000, deliveryFee: 0, total: 110000, phone: "+998901234567", address: "" });
    expect(user(CUSTOMER)).toMatchObject({ name: "Dilnoza opa", phone: "+998901234567" });
  });

  it("adds the delivery fee and keeps the address for deliveries", async () => {
    ctx.store.settings.update({ deliveryFee: 10000 });
    const order = await ctx.orders.place(CUSTOMER, deliveryOrder());
    expect(order).toMatchObject({ deliveryFee: 10000, total: 120000, address: "Qo'qon, Navoiy ko'chasi 12" });
    expect(user(CUSTOMER).address).toBe("Qo'qon, Navoiy ko'chasi 12");
  });

  it("accepts a GPS location instead of a typed address", async () => {
    const order = await ctx.orders.place(CUSTOMER, deliveryOrder({ address: "", latitude: 40.5, longitude: 70.9 }));
    expect(order).toMatchObject({ latitude: 40.5, longitude: 70.9 });
  });

  it.each([
    ["an empty cart", { items: [] }, "bo'sh"],
    ["a bad phone", { phone: "abc" }, "Telefon"],
    ["no name", { name: " " }, "Ismingizni"],
    ["delivery without an address", { fulfillment: "delivery" }, "Manzil"],
    ["an unknown product", { items: [{ id: 999, quantity: 1 }] }, "sotuvda yo'q"],
  ])("rejects %s", async (_label, extra, message) => {
    await expect(ctx.orders.place(CUSTOMER, pickupOrder(extra))).rejects.toThrow(message);
  });

  it("takes stock, refuses to oversell and warns admins when stock runs low", async () => {
    ctx.store.catalog.updateProduct(3, { stock: 7 });
    await ctx.orders.place(CUSTOMER, pickupOrder({ items: [{ id: 3, quantity: 3 }] }));
    expect(ctx.store.catalog.getProduct(3)?.stock).toBe(4);
    expect(ctx.notifier.to(OWNER).some((t) => t.includes("Kam qoldi") && t.includes("4 dona"))).toBe(true);

    const error = await ctx.orders.place(CUSTOMER, pickupOrder({ items: [{ id: 3, quantity: 5 }] })).catch((e) => e);
    expect(error).toBeInstanceOf(UserError);
    expect(error.message).toContain("faqat 4 dona");
    expect(ctx.store.catalog.getProduct(3)?.stock).toBe(4); // nothing taken by the failed order
  });

  it("tells the customer and the sellers", async () => {
    const order = await ctx.orders.place(CUSTOMER, pickupOrder({ note: "<b>Tezroq</b>" }));
    expect(ctx.notifier.to(CUSTOMER)[0]).toContain(`№${order.id}`);
    for (const id of [SELLER, OWNER]) expect(ctx.notifier.to(id)[0]).toContain("Yangi buyurtma");
    expect(ctx.notifier.to(SELLER)[0]).toContain("&lt;b&gt;Tezroq");
    expect(ctx.notifier.to(DRIVER)).toEqual([]);
  });
});

describe("moving orders", () => {
  it("runs a pickup order: new → ready → handed over and paid", async () => {
    const { id } = await ctx.orders.place(CUSTOMER, pickupOrder());
    ctx.store.settings.update({ pickupAddress: "Uyimiz: Bog'ishamol 5" });

    await ctx.orders.transition(id, "ready", user(SELLER));
    expect(ctx.notifier.to(CUSTOMER).at(-1)).toContain("Bog'ishamol 5");

    const done = await ctx.orders.transition(id, "completed", user(SELLER));
    expect(done).toMatchObject({ status: "completed", paid: true });
  });

  it("runs a delivery: drivers are told, the driver is recorded", async () => {
    const { id } = await ctx.orders.place(CUSTOMER, deliveryOrder());
    await ctx.orders.transition(id, "ready", user(SELLER));
    expect(ctx.notifier.to(DRIVER)[0]).toContain("Yetkazish kerak");

    await expect(ctx.orders.transition(id, "delivering", user(SELLER))).rejects.toThrow(UserError);
    expect((await ctx.orders.transition(id, "delivering", user(DRIVER))).driverName).toBe("Aka");
    expect((await ctx.orders.transition(id, "completed", user(DRIVER))).paid).toBe(true);
  });

  it("lets the customer cancel only while it's new, and returns the stock", async () => {
    ctx.store.catalog.updateProduct(3, { stock: 10 });
    const first = await ctx.orders.place(CUSTOMER, pickupOrder());
    await ctx.orders.transition(first.id, "cancelled", user(CUSTOMER));
    expect(ctx.store.catalog.getProduct(3)?.stock).toBe(10);
    expect(ctx.notifier.to(SELLER).at(-1)).toContain("bekor qildi");

    const second = await ctx.orders.place(CUSTOMER, pickupOrder());
    await ctx.orders.transition(second.id, "ready", user(SELLER));
    await expect(ctx.orders.transition(second.id, "cancelled", user(CUSTOMER))).rejects.toThrow(UserError);
  });

  it("doesn't let strangers touch other people's orders", async () => {
    const { id } = await ctx.orders.place(CUSTOMER, pickupOrder());
    ctx.store.users.touch(77, "Stranger", null);
    await expect(ctx.orders.transition(id, "cancelled", user(77))).rejects.toThrow(UserError);
  });

  it("treats owners as admins", async () => {
    const { id } = await ctx.orders.place(CUSTOMER, deliveryOrder());
    expect(ctx.orders.rolesOf(user(OWNER))).toEqual(["admin"]);
    await ctx.orders.transition(id, "ready", user(OWNER));
    await ctx.orders.transition(id, "delivering", user(OWNER));
    await ctx.orders.transition(id, "cancelled", user(OWNER));
  });
});

describe("normalizePhone", () => {
  it.each([
    ["+998 90 123-45-67", "+998901234567"],
    ["998901234567", "+998901234567"],
    ["90 123 45 67", "+998901234567"],
    ["12345", null],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});
