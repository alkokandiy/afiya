import { describe, expect, it } from "vitest";
import { CartError, parseCartItems } from "../src/store.js";
import { createStore } from "./helpers.js";

describe("parseCartItems", () => {
  it("merges duplicate products and ignores extra fields like client prices", () => {
    expect(
      parseCartItems([
        { id: 1, quantity: 2, price: 1 },
        { id: 1, quantity: 1 },
        { id: 3, quantity: 1 },
      ]),
    ).toEqual([
      { id: 1, quantity: 3 },
      { id: 3, quantity: 1 },
    ]);
  });

  it.each([
    ["not an array", { id: 1 }],
    ["empty", []],
    ["zero quantity", [{ id: 1, quantity: 0 }]],
    ["fractional quantity", [{ id: 1, quantity: 1.5 }]],
    ["string id", [{ id: "1", quantity: 1 }]],
    ["too many of one product", [{ id: 1, quantity: 100 }]],
    ["null entry", [null]],
  ])("rejects %s", (_label, input) => {
    expect(() => parseCartItems(input)).toThrow(CartError);
  });
});

describe("Store", () => {
  it("seeds the catalog", () => {
    const products = createStore().listProducts();
    expect(products).toHaveLength(19);
    expect(products[0]).toMatchObject({ id: 1, price: 70000, image: "/img/products/1.webp" });
  });

  it("prices carts from the database", () => {
    const store = createStore();
    expect(store.priceCart([{ id: 1, quantity: 2 }, { id: 16, quantity: 1 }])).toEqual({
      lines: [
        { productId: 1, title: "Pushti Nexx (Extra)", price: 70000, quantity: 2 },
        { productId: 16, title: "Raksha", price: 8000, quantity: 1 },
      ],
      total: 148000,
    });

    store.setPrice(16, 9500);
    expect(store.priceCart([{ id: 16, quantity: 2 }]).total).toBe(19000);
  });

  it("rejects unknown and hidden products", () => {
    const store = createStore();
    expect(() => store.priceCart([{ id: 999, quantity: 1 }])).toThrow(CartError);
    store.setActive(2, false);
    expect(store.listProducts().map((p) => p.id)).not.toContain(2);
    expect(() => store.priceCart([{ id: 2, quantity: 1 }])).toThrow(CartError);
  });

  it("round-trips both kinds of customer location", () => {
    const store = createStore();
    store.saveCustomer(1, { name: "A", phone: "+1", location: { kind: "geo", latitude: 40.5, longitude: 71 } });
    store.saveCustomer(2, { name: "B", phone: "+2", location: { kind: "text", address: "Farg'ona, Mustaqillik 5" } });
    expect(store.getCustomer(1)?.location).toEqual({ kind: "geo", latitude: 40.5, longitude: 71 });
    expect(store.getCustomer(2)?.location).toEqual({ kind: "text", address: "Farg'ona, Mustaqillik 5" });
  });

  it("stores orders with their lines and status", () => {
    const store = createStore();
    const customer = { name: "A", phone: "+1", location: { kind: "text", address: "Somewhere 1" } } as const;
    const order = store.createOrder(7, customer, store.priceCart([{ id: 3, quantity: 2 }]));
    expect(order).toMatchObject({ chatId: 7, total: 110000, status: "new", lines: [{ productId: 3, quantity: 2 }] });
    expect(store.setOrderStatus(order.id, "delivering")?.status).toBe("delivering");
    expect(store.listRecentOrders(5).map((o) => o.id)).toEqual([order.id]);
  });
});
