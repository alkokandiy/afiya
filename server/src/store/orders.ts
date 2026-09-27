import type {
  Fulfillment,
  Order,
  OrderLine,
  OrderStatus,
  PaymentMethod,
  Stats,
} from "../../../shared/types.js";
import type { DB } from "../db.js";

// Uzbekistan is UTC+5 all year; "today" in stats means the shop's local day.
const LOCAL = "'+5 hours'";

interface OrderRow {
  id: number;
  user_id: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  payment: PaymentMethod;
  paid: number;
  name: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  note: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  driver_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewOrder {
  userId: number;
  fulfillment: Fulfillment;
  payment: PaymentMethod;
  name: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  note: string;
  deliveryFee: number;
  lines: OrderLine[];
}

const toIso = (sqlite: string) => `${sqlite.replace(" ", "T")}Z`;

const SELECT_ORDER = `
  SELECT o.*, COALESCE(NULLIF(d.name, ''), d.first_name) AS driver_name
  FROM orders o LEFT JOIN users d ON d.id = o.driver_id`;

export class OrderStore {
  constructor(private readonly db: DB) {}

  /** Inserts the order, its lines and the first event. Run inside the caller's transaction. */
  insert(order: NewOrder): number {
    const subtotal = order.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const id = Number(
      this.db
        .prepare(
          `INSERT INTO orders (user_id, fulfillment, payment, name, phone, address, latitude, longitude, note,
                               subtotal, delivery_fee, total)
           VALUES (@userId, @fulfillment, @payment, @name, @phone, @address, @latitude, @longitude, @note,
                   @subtotal, @deliveryFee, @total)`,
        )
        .run({ ...order, subtotal, total: subtotal + order.deliveryFee }).lastInsertRowid,
    );
    const insertLine = this.db.prepare(
      "INSERT INTO order_items (order_id, product_id, title, title_cyr, price, quantity) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const line of order.lines) insertLine.run(id, line.productId, line.title, line.titleCyr, line.price, line.quantity);
    this.addEvent(id, "new", order.userId);
    return id;
  }

  get(id: number): Order | undefined {
    const row = this.db.prepare(`${SELECT_ORDER} WHERE o.id = ?`).get(id) as OrderRow | undefined;
    return row && this.toOrder(row);
  }

  listForUser(userId: number, limit = 50): Order[] {
    const rows = this.db
      .prepare(`${SELECT_ORDER} WHERE o.user_id = ? ORDER BY o.id DESC LIMIT ?`)
      .all(userId, limit) as OrderRow[];
    return rows.map((row) => this.toOrder(row));
  }

  /** Open orders oldest first (work queue); finished ones newest first. */
  list(filter: { statuses: OrderStatus[]; fulfillment?: Fulfillment; limit?: number }): Order[] {
    const open = filter.statuses.every((s) => s === "new" || s === "ready" || s === "delivering");
    const rows = this.db
      .prepare(
        `${SELECT_ORDER}
         WHERE o.status IN (${filter.statuses.map(() => "?").join(",")})
           ${filter.fulfillment ? "AND o.fulfillment = ?" : ""}
         ORDER BY o.id ${open ? "ASC" : "DESC"} LIMIT ?`,
      )
      .all(...filter.statuses, ...(filter.fulfillment ? [filter.fulfillment] : []), filter.limit ?? 100) as OrderRow[];
    return rows.map((row) => this.toOrder(row));
  }

  setStatus(id: number, status: OrderStatus, byUserId: number, extra: { paid?: boolean; driverId?: number } = {}): void {
    this.db
      .prepare(
        `UPDATE orders SET status = ?, paid = COALESCE(?, paid), driver_id = COALESCE(?, driver_id),
                           updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(status, extra.paid === undefined ? null : Number(extra.paid), extra.driverId ?? null, id);
    this.addEvent(id, status, byUserId);
  }

  stats(lowStockThreshold: number, topLimit = 5): Stats {
    const period = (days: number) =>
      this.db
        .prepare(
          `SELECT COUNT(*) AS orders,
                  COALESCE(SUM(CASE WHEN status = 'completed' THEN total END), 0) AS revenue
           FROM orders
           WHERE status != 'cancelled'
             AND date(created_at, ${LOCAL}) > date('now', ${LOCAL}, '-${days} days')`,
        )
        .get() as { orders: number; revenue: number };

    const open = Object.fromEntries(
      (["new", "ready", "delivering"] as const).map((status) => [
        status,
        (this.db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = ?").get(status) as { n: number }).n,
      ]),
    ) as Stats["open"];

    const topProducts = this.db
      .prepare(
        `SELECT i.title, i.title_cyr AS titleCyr, SUM(i.quantity) AS quantity
         FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE o.status != 'cancelled' AND o.created_at > datetime('now', '-30 days')
         GROUP BY i.product_id ORDER BY quantity DESC LIMIT ?`,
      )
      .all(topLimit) as Stats["topProducts"];

    const lowStock = this.db
      .prepare("SELECT id, title, title_cyr AS titleCyr, stock FROM products WHERE active = 1 AND stock IS NOT NULL AND stock <= ? ORDER BY stock")
      .all(lowStockThreshold) as Stats["lowStock"];

    return { today: period(1), week: period(7), open, topProducts, lowStock };
  }

  private addEvent(orderId: number, status: OrderStatus, userId: number): void {
    this.db.prepare("INSERT INTO order_events (order_id, status, user_id) VALUES (?, ?, ?)").run(orderId, status, userId);
  }

  private toOrder(row: OrderRow): Order {
    const lines = this.db
      .prepare("SELECT product_id AS productId, title, title_cyr AS titleCyr, price, quantity FROM order_items WHERE order_id = ?")
      .all(row.id) as OrderLine[];
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      fulfillment: row.fulfillment,
      payment: row.payment,
      paid: row.paid === 1,
      name: row.name,
      phone: row.phone,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      note: row.note,
      subtotal: row.subtotal,
      deliveryFee: row.delivery_fee,
      total: row.total,
      driverName: row.driver_name,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
      lines,
    };
  }
}
