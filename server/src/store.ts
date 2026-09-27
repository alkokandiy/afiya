import type { DB } from "./db.js";

export interface Product {
  id: number;
  title: string;
  price: number;
  image: string;
  active: boolean;
}

export type Location =
  | { kind: "text"; address: string }
  | { kind: "geo"; latitude: number; longitude: number };

export interface Customer {
  name: string;
  phone: string;
  location: Location;
}

export interface CartItem {
  id: number;
  quantity: number;
}

export interface CartLine {
  productId: number;
  title: string;
  price: number;
  quantity: number;
}

export interface PricedCart {
  lines: CartLine[];
  total: number;
}

export type CheckoutStep = "name" | "phone" | "location" | "review";

export interface CheckoutSession {
  step: CheckoutStep;
  items: CartItem[];
  draft: Partial<Customer>;
}

export const ORDER_STATUSES = ["new", "confirmed", "delivering", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order extends Customer {
  id: number;
  chatId: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  lines: CartLine[];
}

export const MAX_QUANTITY = 99;
export const MAX_LINES = 50;

export class CartError extends Error {}

interface ProductRow {
  id: number;
  title: string;
  price: number;
  image: string;
  active: number;
}

interface LocationColumns {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface OrderRow extends LocationColumns {
  id: number;
  chat_id: number;
  name: string;
  phone: string;
  total: number;
  status: OrderStatus;
  created_at: string;
}

const toProduct = (row: ProductRow): Product => ({ ...row, active: row.active === 1 });

function toLocation(row: LocationColumns): Location {
  if (row.latitude !== null && row.longitude !== null) {
    return { kind: "geo", latitude: row.latitude, longitude: row.longitude };
  }
  return { kind: "text", address: row.address ?? "" };
}

function fromLocation(location: Location): LocationColumns {
  return location.kind === "geo"
    ? { address: null, latitude: location.latitude, longitude: location.longitude }
    : { address: location.address, latitude: null, longitude: null };
}

/** Checks untrusted cart input (from the web app) and returns it normalized: one line per product. */
export function parseCartItems(input: unknown): CartItem[] {
  if (!Array.isArray(input)) throw new CartError("Savat noto'g'ri formatda.");

  const quantities = new Map<number, number>();
  for (const entry of input) {
    const { id, quantity } = (entry ?? {}) as Record<string, unknown>;
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(quantity) || (quantity as number) < 1) {
      throw new CartError("Mahsulot ma'lumotlarida xatolik.");
    }
    quantities.set(id as number, (quantities.get(id as number) ?? 0) + (quantity as number));
  }

  if (quantities.size === 0) throw new CartError("Savatingiz bo'sh!");
  if (quantities.size > MAX_LINES) throw new CartError("Savatda mahsulotlar juda ko'p.");
  for (const quantity of quantities.values()) {
    if (quantity > MAX_QUANTITY) throw new CartError(`Bitta mahsulotdan ko'pi bilan ${MAX_QUANTITY} dona.`);
  }
  return [...quantities].map(([id, quantity]) => ({ id, quantity }));
}

export class Store {
  constructor(private readonly db: DB) {}

  // --- catalog ---

  listProducts({ includeInactive = false } = {}): Product[] {
    const rows = this.db
      .prepare(`SELECT id, title, price, image, active FROM products ${includeInactive ? "" : "WHERE active = 1"} ORDER BY sort, id`)
      .all() as ProductRow[];
    return rows.map(toProduct);
  }

  getProduct(id: number): Product | undefined {
    const row = this.db.prepare("SELECT id, title, price, image, active FROM products WHERE id = ?").get(id) as
      | ProductRow
      | undefined;
    return row && toProduct(row);
  }

  setPrice(id: number, price: number): boolean {
    return this.db.prepare("UPDATE products SET price = ? WHERE id = ?").run(price, id).changes > 0;
  }

  setActive(id: number, active: boolean): boolean {
    return this.db.prepare("UPDATE products SET active = ? WHERE id = ?").run(active ? 1 : 0, id).changes > 0;
  }

  /** Prices a cart from the database. Client-sent prices and titles are never used. */
  priceCart(items: CartItem[]): PricedCart {
    const lines = items.map(({ id, quantity }) => {
      const product = this.getProduct(id);
      if (!product?.active) throw new CartError("Ba'zi mahsulotlar endi mavjud emas. Iltimos, qaytadan tanlang.");
      return { productId: product.id, title: product.title, price: product.price, quantity };
    });
    return { lines, total: lines.reduce((sum, line) => sum + line.price * line.quantity, 0) };
  }

  // --- customers ---

  getCustomer(chatId: number): Customer | undefined {
    const row = this.db
      .prepare("SELECT name, phone, address, latitude, longitude FROM customers WHERE chat_id = ?")
      .get(chatId) as (LocationColumns & { name: string; phone: string }) | undefined;
    return row && { name: row.name, phone: row.phone, location: toLocation(row) };
  }

  saveCustomer(chatId: number, customer: Customer): void {
    this.db
      .prepare(
        `INSERT INTO customers (chat_id, name, phone, address, latitude, longitude)
         VALUES (@chatId, @name, @phone, @address, @latitude, @longitude)
         ON CONFLICT (chat_id) DO UPDATE SET
           name = excluded.name, phone = excluded.phone, address = excluded.address,
           latitude = excluded.latitude, longitude = excluded.longitude, updated_at = datetime('now')`,
      )
      .run({ chatId, name: customer.name, phone: customer.phone, ...fromLocation(customer.location) });
  }

  // --- checkout sessions ---

  getSession(chatId: number): CheckoutSession | undefined {
    const row = this.db.prepare("SELECT step, items, draft FROM checkout_sessions WHERE chat_id = ?").get(chatId) as
      | { step: CheckoutStep; items: string; draft: string }
      | undefined;
    return row && { step: row.step, items: JSON.parse(row.items), draft: JSON.parse(row.draft) };
  }

  saveSession(chatId: number, session: CheckoutSession): void {
    this.db
      .prepare(
        `INSERT INTO checkout_sessions (chat_id, step, items, draft) VALUES (?, ?, ?, ?)
         ON CONFLICT (chat_id) DO UPDATE SET
           step = excluded.step, items = excluded.items, draft = excluded.draft, updated_at = datetime('now')`,
      )
      .run(chatId, session.step, JSON.stringify(session.items), JSON.stringify(session.draft));
  }

  clearSession(chatId: number): void {
    this.db.prepare("DELETE FROM checkout_sessions WHERE chat_id = ?").run(chatId);
  }

  // --- orders ---

  createOrder(chatId: number, customer: Customer, cart: PricedCart): Order {
    const insertOrder = this.db.prepare(
      `INSERT INTO orders (chat_id, name, phone, address, latitude, longitude, total)
       VALUES (@chatId, @name, @phone, @address, @latitude, @longitude, @total)`,
    );
    const insertLine = this.db.prepare(
      "INSERT INTO order_items (order_id, product_id, title, price, quantity) VALUES (?, ?, ?, ?, ?)",
    );

    const id = this.db.transaction(() => {
      const orderId = Number(
        insertOrder.run({
          chatId,
          name: customer.name,
          phone: customer.phone,
          ...fromLocation(customer.location),
          total: cart.total,
        }).lastInsertRowid,
      );
      for (const line of cart.lines) insertLine.run(orderId, line.productId, line.title, line.price, line.quantity);
      return orderId;
    })();

    return this.getOrder(id)!;
  }

  getOrder(id: number): Order | undefined {
    const row = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
    return row && this.toOrder(row);
  }

  listRecentOrders(limit: number): Order[] {
    const rows = this.db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT ?").all(limit) as OrderRow[];
    return rows.map((row) => this.toOrder(row));
  }

  setOrderStatus(id: number, status: OrderStatus): Order | undefined {
    this.db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    return this.getOrder(id);
  }

  private toOrder(row: OrderRow): Order {
    const lines = this.db
      .prepare("SELECT product_id AS productId, title, price, quantity FROM order_items WHERE order_id = ?")
      .all(row.id) as CartLine[];
    return {
      id: row.id,
      chatId: row.chat_id,
      name: row.name,
      phone: row.phone,
      location: toLocation(row),
      total: row.total,
      status: row.status,
      createdAt: row.created_at,
      lines,
    };
  }
}
