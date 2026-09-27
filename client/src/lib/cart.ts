export interface Product {
  id: number;
  title: string;
  price: number;
  image: string;
}

export interface CartLine extends Product {
  quantity: number;
}

export function addItem(cart: CartLine[], product: Product): CartLine[] {
  return cart.some((line) => line.id === product.id)
    ? cart.map((line) => (line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line))
    : [...cart, { ...product, quantity: 1 }];
}

export function removeItem(cart: CartLine[], productId: number): CartLine[] {
  return cart
    .map((line) => (line.id === productId ? { ...line, quantity: line.quantity - 1 } : line))
    .filter((line) => line.quantity > 0);
}

export function quantityOf(cart: CartLine[], productId: number): number {
  return cart.find((line) => line.id === productId)?.quantity ?? 0;
}

/** Display only — the server recomputes the real total from its own prices. */
export function totalPrice(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
}

export function toCheckoutItems(cart: CartLine[]) {
  return cart.map(({ id, quantity }) => ({ id, quantity }));
}

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString("en-US")} so'm`;
}
