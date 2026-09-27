import { beforeEach, describe, expect, it } from "vitest";
import { Checkout, normalizePhone } from "../src/checkout.js";
import { CartError, type Store } from "../src/store.js";
import { createFakeApi, createStore } from "./helpers.js";

const CUSTOMER = 100;
const ADMIN = 900;

let store: Store;
let fake: ReturnType<typeof createFakeApi>;
let checkout: Checkout;

const lastText = () => fake.sent.at(-1)?.text ?? "";
const textsTo = (chatId: number) => fake.sent.filter((m) => m.chatId === chatId).map((m) => m.text);

beforeEach(() => {
  store = createStore();
  fake = createFakeApi();
  checkout = new Checkout(store, fake.api, [ADMIN]);
});

async function fillDetails() {
  await checkout.handleText(CUSTOMER, "Alisher <b>");
  await checkout.handleText(CUSTOMER, "+998 90 123 45 67");
  await checkout.handleLocation(CUSTOMER, 40.47271, 70.994328);
}

describe("Checkout", () => {
  it("walks a new customer from cart to confirmed order", async () => {
    await checkout.start(CUSTOMER, [{ id: 1, quantity: 2, price: 1 }]);
    expect(textsTo(CUSTOMER).at(-2)).toContain("140,000 so'm"); // server price, not the client's 1 so'm
    expect(lastText()).toContain("Ismingizni");

    await fillDetails();
    expect(store.getCustomer(CUSTOMER)).toEqual({
      name: "Alisher <b>",
      phone: "+998901234567",
      location: { kind: "geo", latitude: 40.47271, longitude: 70.994328 },
    });
    const review = fake.sent.at(-1)!;
    expect(review.text).toContain("Alisher &lt;b&gt;");
    expect(review.text).toContain("GPS (40.47271, 70.99433)");
    expect(JSON.stringify(review.options.reply_markup)).toContain("confirm_order");

    await checkout.confirm(CUSTOMER);
    const [order] = store.listRecentOrders(1);
    expect(order).toMatchObject({ chatId: CUSTOMER, total: 140000, status: "new" });
    expect(textsTo(CUSTOMER).at(-1)).toContain(`#${order!.id} qabul qilindi`);
    expect(textsTo(ADMIN)[0]).toContain("Yangi buyurtma");
    expect(fake.mock.sendLocation).toHaveBeenCalledWith(ADMIN, 40.47271, 70.994328);
  });

  it("skips straight to review for a returning customer", async () => {
    store.saveCustomer(CUSTOMER, { name: "Ali", phone: "+1234567", location: { kind: "text", address: "Some street 1" } });
    await checkout.start(CUSTOMER, [{ id: 3, quantity: 1 }]);
    expect(fake.sent).toHaveLength(1);
    expect(lastText()).toContain("Some street 1");
    expect(lastText()).toContain("55,000 so'm");
  });

  it("returns to the review with the cart after changing details", async () => {
    store.saveCustomer(CUSTOMER, { name: "Old", phone: "+1234567", location: { kind: "text", address: "Old street 1" } });
    await checkout.start(CUSTOMER, [{ id: 3, quantity: 1 }]);
    await checkout.changeDetails(CUSTOMER);
    await checkout.handleText(CUSTOMER, "New Name");
    await checkout.handleText(CUSTOMER, "901234567");
    await checkout.handleText(CUSTOMER, "New street 22");

    expect(lastText()).toContain("Ko'k Nexx 5L");
    expect(lastText()).toContain("New Name");
    expect(lastText()).toContain("New street 22");
    await checkout.confirm(CUSTOMER);
    expect(store.listRecentOrders(1)[0]).toMatchObject({ name: "New Name", total: 55000 });
  });

  it("does not create a duplicate order when confirm is tapped twice", async () => {
    await checkout.start(CUSTOMER, [{ id: 1, quantity: 1 }]);
    await fillDetails();
    await checkout.confirm(CUSTOMER);
    await checkout.confirm(CUSTOMER);
    expect(store.listRecentOrders(10)).toHaveLength(1);
    expect(lastText()).toContain("eskirgan");
  });

  it("charges the price current at confirmation", async () => {
    await checkout.start(CUSTOMER, [{ id: 1, quantity: 1 }]);
    await fillDetails();
    store.setPrice(1, 75000);
    await checkout.confirm(CUSTOMER);
    expect(store.listRecentOrders(1)[0]?.total).toBe(75000);
  });

  it("re-prompts on invalid name, phone and address", async () => {
    await checkout.start(CUSTOMER, [{ id: 1, quantity: 1 }]);
    await checkout.handleText(CUSTOMER, "A");
    expect(lastText()).toContain("to'g'ri");
    await checkout.handleText(CUSTOMER, "Ali");
    await checkout.handleText(CUSTOMER, "call me");
    expect(lastText()).toContain("Raqam noto'g'ri");
    await checkout.handleText(CUSTOMER, "+998901234567");
    await checkout.handleText(CUSTOMER, "x");
    expect(lastText()).toContain("manzilni");
    expect(store.getSession(CUSTOMER)?.step).toBe("location");
  });

  it("ignores messages when no checkout is in progress", async () => {
    expect(await checkout.handleText(CUSTOMER, "hello")).toBe(false);
    expect(await checkout.handleLocation(CUSTOMER, 1, 2)).toBe(false);
    expect(fake.sent).toHaveLength(0);
  });

  it("rejects bad carts", async () => {
    await expect(checkout.start(CUSTOMER, [])).rejects.toThrow(CartError);
    await expect(checkout.start(CUSTOMER, [{ id: 999, quantity: 1 }])).rejects.toThrow(CartError);
  });

  it("only allows forward status changes and tells the customer", async () => {
    await checkout.start(CUSTOMER, [{ id: 1, quantity: 1 }]);
    await fillDetails();
    await checkout.confirm(CUSTOMER);
    const id = store.listRecentOrders(1)[0]!.id;

    expect(await checkout.setStatus(id, "delivered")).toBeUndefined();
    expect((await checkout.setStatus(id, "confirmed"))?.status).toBe("confirmed");
    expect(lastText()).toContain("Tasdiqlandi");
    expect((await checkout.setStatus(id, "cancelled"))?.status).toBe("cancelled");
    expect(await checkout.setStatus(id, "delivering")).toBeUndefined();
  });
});

describe("normalizePhone", () => {
  it.each([
    ["+998 90 123-45-67", "+998901234567"],
    ["998901234567", "+998901234567"],
    ["90 123 45 67", "901234567"],
    ["12345", null],
    ["hello", null],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});
