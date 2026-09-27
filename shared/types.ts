// Types and rules shared by the server (which enforces them) and the client (which shows the right buttons).

export type Script = "latn" | "cyrl";

export const ROLES = ["admin", "seller", "driver"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  seller: "Sotuvchi",
  driver: "Haydovchi",
};

export type Fulfillment = "delivery" | "pickup";
export type PaymentMethod = "cash" | "transfer";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Naqd pul",
  transfer: "Kartaga o'tkazma",
};

export const ORDER_STATUSES = ["new", "ready", "delivering", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** What the customer sees. */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Qabul qilindi",
  ready: "Tayyor",
  delivering: "Yo'lda",
  completed: "Topshirildi",
  cancelled: "Bekor qilindi",
};

export interface Transition {
  from: OrderStatus;
  to: OrderStatus;
  /** Staff roles allowed to do it. "owner" is the customer who placed the order. */
  by: (Role | "owner")[];
  fulfillment?: Fulfillment;
  /** Button text in the staff screens. */
  action: string;
}

export const TRANSITIONS: Transition[] = [
  { from: "new", to: "ready", by: ["admin", "seller"], action: "Yig'ildi, tayyor" },
  { from: "ready", to: "delivering", by: ["admin", "driver"], fulfillment: "delivery", action: "Olib ketdim" },
  { from: "ready", to: "completed", by: ["admin", "seller"], fulfillment: "pickup", action: "Topshirildi, pul olindi" },
  { from: "delivering", to: "completed", by: ["admin", "driver"], action: "Yetkazildi, pul olindi" },
  { from: "new", to: "cancelled", by: ["admin", "seller", "owner"], action: "Bekor qilish" },
  { from: "ready", to: "cancelled", by: ["admin", "seller"], action: "Bekor qilish" },
  { from: "delivering", to: "cancelled", by: ["admin"], action: "Bekor qilish" },
];

export function findTransition(
  order: { status: OrderStatus; fulfillment: Fulfillment },
  to: OrderStatus,
  actor: { roles: Role[]; isOwner: boolean },
): Transition | undefined {
  return TRANSITIONS.find(
    (t) =>
      t.from === order.status &&
      t.to === to &&
      (!t.fulfillment || t.fulfillment === order.fulfillment) &&
      t.by.some((who) => (who === "owner" ? actor.isOwner : actor.roles.includes(who))),
  );
}

export function availableTransitions(
  order: { status: OrderStatus; fulfillment: Fulfillment },
  actor: { roles: Role[]; isOwner: boolean },
): Transition[] {
  return ORDER_STATUSES.map((to) => findTransition(order, to, actor)).filter((t): t is Transition => !!t);
}

// --- API shapes ---

export interface Category {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  title: string;
  /** Hand-written Cyrillic name; empty means "transliterate the title". */
  titleCyr: string;
  price: number;
  image: string;
  categoryId: number | null;
  /** null = not tracked (always available). */
  stock: number | null;
}

export interface AdminProduct extends Product {
  active: boolean;
}

export interface ShopInfo {
  phone: string;
  pickupAddress: string;
  pickupHours: string;
  deliveryFee: number;
}

export interface Settings extends ShopInfo {
  lowStockThreshold: number;
}

export interface Catalog {
  categories: Category[];
  products: Product[];
  shop: ShopInfo;
}

export interface Me {
  id: number;
  name: string;
  phone: string;
  address: string;
  script: Script;
  roles: Role[];
}

export interface OrderLine {
  productId: number;
  title: string;
  titleCyr: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: number;
  userId: number;
  status: OrderStatus;
  fulfillment: Fulfillment;
  payment: PaymentMethod;
  paid: boolean;
  name: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  note: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  driverName: string | null;
  createdAt: string;
  updatedAt: string;
  lines: OrderLine[];
}

export interface PlaceOrderRequest {
  items: { id: number; quantity: number }[];
  fulfillment: Fulfillment;
  payment: PaymentMethod;
  name: string;
  phone: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  note?: string;
}

export interface StaffUser {
  id: number;
  displayName: string;
  username: string | null;
  phone: string;
  roles: Role[];
  /** From ADMIN_CHAT_IDS; can't be removed from the panel. */
  owner: boolean;
}

export interface Stats {
  today: { orders: number; revenue: number };
  week: { orders: number; revenue: number };
  open: Record<"new" | "ready" | "delivering", number>;
  topProducts: { title: string; titleCyr: string; quantity: number }[];
  lowStock: { id: number; title: string; titleCyr: string; stock: number }[];
}

/** A product's name in the reader's script: the hand-written Cyrillic name when there is one. */
export function titleIn(item: { title: string; titleCyr: string }, cyrillic: boolean, toCyrillic: (s: string) => string): string {
  return cyrillic ? item.titleCyr || toCyrillic(item.title) : item.title;
}

export function formatMoney(amount: number): string {
  return `${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so'm`;
}

export function mapsUrl(order: Pick<Order, "latitude" | "longitude" | "address">): string {
  const query = order.latitude !== null && order.longitude !== null ? `${order.latitude},${order.longitude}` : order.address;
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}
