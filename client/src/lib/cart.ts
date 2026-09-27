import type { Product } from "../../../shared/types";

/** What's kept in the cart: just ids and quantities. Prices always come from the current catalog. */
export type Cart = { id: number; quantity: number }[];

export interface CartLine {
  product: Product;
  quantity: number;
}

export const MAX_QUANTITY = 99;

const maxFor = (product: Product) => Math.min(MAX_QUANTITY, product.stock ?? MAX_QUANTITY);

export function quantityOf(cart: Cart, id: number): number {
  return cart.find((item) => item.id === id)?.quantity ?? 0;
}

export function setQuantity(cart: Cart, product: Product, quantity: number): Cart {
  const clamped = Math.max(0, Math.min(quantity, maxFor(product)));
  if (clamped === 0) return cart.filter((item) => item.id !== product.id);
  return cart.some((item) => item.id === product.id)
    ? cart.map((item) => (item.id === product.id ? { ...item, quantity: clamped } : item))
    : [...cart, { id: product.id, quantity: clamped }];
}

/** Cart items that still exist in the catalog, with quantities capped to what's in stock. */
export function cartLines(cart: Cart, products: Product[]): CartLine[] {
  return cart.flatMap((item) => {
    const product = products.find((p) => p.id === item.id);
    if (!product || maxFor(product) === 0) return [];
    return [{ product, quantity: Math.min(item.quantity, maxFor(product)) }];
  });
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

const STORAGE_KEY = "afiya.cart";

export function loadCart(): Cart {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => Number.isInteger(item?.id) && Number.isInteger(item?.quantity) && item.quantity > 0)
      : [];
  } catch {
    return [];
  }
}

export function saveCart(cart: Cart): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Storage can be unavailable (private mode); the cart just won't survive closing the app.
  }
}
