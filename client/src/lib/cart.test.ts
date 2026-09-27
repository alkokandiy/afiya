import { describe, expect, it } from "vitest";
import { addItem, formatMoney, quantityOf, removeItem, toCheckoutItems, totalPrice, type Product } from "./cart";

const soap: Product = { id: 13, title: "Dur Sovun", price: 9000, image: "/img/products/13.webp" };
const gel: Product = { id: 19, title: "Nexx Gel 2.5L", price: 35000, image: "/img/products/19.webp" };

describe("cart", () => {
  it("adds, increments and removes items", () => {
    let cart = addItem([], soap);
    cart = addItem(cart, soap);
    cart = addItem(cart, gel);
    expect(quantityOf(cart, soap.id)).toBe(2);
    expect(totalPrice(cart)).toBe(53000);

    cart = removeItem(cart, soap.id);
    cart = removeItem(cart, soap.id);
    expect(quantityOf(cart, soap.id)).toBe(0);
    expect(cart.map((line) => line.id)).toEqual([gel.id]);
  });

  it("ignores removing something not in the cart", () => {
    expect(removeItem(addItem([], gel), soap.id)).toEqual([{ ...gel, quantity: 1 }]);
  });

  it("sends only ids and quantities to the server", () => {
    expect(toCheckoutItems(addItem(addItem([], gel), gel))).toEqual([{ id: 19, quantity: 2 }]);
  });

  it("formats money", () => {
    expect(formatMoney(148000)).toBe("148,000 so'm");
  });
});
