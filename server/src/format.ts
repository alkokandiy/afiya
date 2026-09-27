import type { CartLine, Customer, Location, Order, OrderStatus } from "./store.js";

// All bot messages are sent with parse_mode "HTML"; anything a user typed must go through this.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString("en-US")} so'm`;
}

export function mapsUrl(location: Location): string {
  const query =
    location.kind === "geo" ? `${location.latitude},${location.longitude}` : location.address;
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

export function formatLocation(location: Location): string {
  const label =
    location.kind === "geo"
      ? `GPS (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})`
      : escapeHtml(location.address);
  return `${label} — <a href="${escapeHtml(mapsUrl(location))}">xaritada</a>`;
}

export function formatLines(lines: CartLine[]): string {
  return lines
    .map((line) => `🔹 ${escapeHtml(line.title)} — ${line.quantity} × ${formatMoney(line.price)}`)
    .join("\n");
}

export function formatCustomer(customer: Customer): string {
  return [
    `👤 ${escapeHtml(customer.name)}`,
    `📞 ${escapeHtml(customer.phone)}`,
    `📍 ${formatLocation(customer.location)}`,
  ].join("\n");
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "🆕 Yangi",
  confirmed: "✅ Tasdiqlandi",
  delivering: "🚚 Yetkazilmoqda",
  delivered: "📦 Yetkazildi",
  cancelled: "❌ Bekor qilindi",
};

export function formatOrder(order: Order): string {
  return [
    `<b>Buyurtma #${order.id}</b> · ${STATUS_LABELS[order.status]}`,
    "",
    formatCustomer(order),
    "",
    formatLines(order.lines),
    "",
    `💰 <b>Jami: ${formatMoney(order.total)}</b>`,
  ].join("\n");
}
