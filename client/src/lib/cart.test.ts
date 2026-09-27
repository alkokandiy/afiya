// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Product } from "../../../shared/types";
import { cartCount, cartLines, cartTotal, loadCart, quantityOf, saveCart, setQuantity, type Cart } from "./cart";

const soap: Product = { id: 13, title: "Dur Sovun", titleCyr: "", price: 9000, image: "", categoryId: 3, stock: null };
const gel: Product = { id: 19, title: "Nexx Gel 2.5L", titleCyr: "Некс гел 2.5Л", price: 35000, image: "", categoryId: 1, stock: 3 };

describe("cart", () => {
  it("adds, changes and removes items", () => {
    let cart: Cart = [];
    cart = setQuantity(cart, soap, 2);
    cart = setQuantity(cart, gel, 1);
    expect(quantityOf(cart, soap.id)).toBe(2);
    cart = setQuantity(cart, soap, 0);
    expect(cart).toEqual([{ id: gel.id, quantity: 1 }]);
  });

  it("never goes over the stock", () => {
    expect(quantityOf(setQuantity([], gel, 10), gel.id)).toBe(3);
  });

  it("drops products that disappeared and caps to current stock", () => {
    const cart: Cart = [{ id: 13, quantity: 2 }, { id: 19, quantity: 5 }, { id: 404, quantity: 1 }];
    const lines = cartLines(cart, [soap, gel]);
    expect(lines.map((l) => [l.product.id, l.quantity])).toEqual([[13, 2], [19, 3]]);
    expect(cartTotal(lines)).toBe(2 * 9000 + 3 * 35000);
    expect(cartCount(lines)).toBe(5);
    expect(cartLines(cart, [soap, { ...gel, stock: 0 }]).map((l) => l.product.id)).toEqual([13]);
  });
});

describe("cart storage", () => {
  beforeEach(() => localStorage.clear());

  it("survives closing the app and ignores junk", () => {
    saveCart([{ id: 1, quantity: 2 }]);
    expect(loadCart()).toEqual([{ id: 1, quantity: 2 }]);
    localStorage.setItem("afiya.cart", '[{"id":"x"},{"id":2,"quantity":1}]');
    expect(loadCart()).toEqual([{ id: 2, quantity: 1 }]);
    localStorage.setItem("afiya.cart", "not json");
    expect(loadCart()).toEqual([]);
  });
});
