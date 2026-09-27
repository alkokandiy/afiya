import { z } from "zod";
import {
  findTransition,
  formatMoney,
  mapsUrl,
  PAYMENT_LABELS,
  titleIn,
  type Order,
  type OrderLine,
  type OrderStatus,
  type Role,
} from "../../shared/types.js";
import { toCyrillic } from "../../shared/translit.js";
import { UserError } from "./errors.js";
import { escapeHtml, type Notifier } from "./notifier.js";
import type { Store, User } from "./store/index.js";

export const MAX_QUANTITY = 99;
export const MAX_LINES = 50;

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length === 9) return `+998${digits}`; // local Uzbek number without the country code
  if (digits.length < 7 || digits.length > 15) return null;
  return `+${digits}`;
}

const placeOrderSchema = z
  .object({
    items: z
      .array(z.object({ id: z.number().int().positive(), quantity: z.number().int().min(1).max(MAX_QUANTITY) }))
      .min(1, "Savatingiz bo'sh.")
      .max(MAX_LINES),
    fulfillment: z.enum(["delivery", "pickup"]),
    payment: z.enum(["cash", "transfer"]),
    name: z.string().trim().min(2, "Ismingizni yozing.").max(64),
    phone: z.string().transform((value, ctx) => {
      const phone = normalizePhone(value);
      if (!phone) {
        ctx.addIssue({ code: "custom", message: "Telefon raqam noto'g'ri." });
        return z.NEVER;
      }
      return phone;
    }),
    address: z.string().trim().max(300).default(""),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
    note: z.string().trim().max(300).default(""),
  })
  .refine((o) => o.fulfillment === "pickup" || o.address.length >= 3 || (o.latitude != null && o.longitude != null), {
    message: "Manzilni yozing yoki joylashuvni yuboring.",
  });

const lineText = (lines: OrderLine[], cyrillic: boolean) =>
  lines.map((l) => `• ${escapeHtml(titleIn(l, cyrillic, toCyrillic))} — ${l.quantity} dona`).join("\n");

export class OrderService {
  constructor(
    private readonly store: Store,
    private readonly notifier: Notifier,
    private readonly ownerIds: number[],
  ) {}

  rolesOf(user: Pick<User, "id" | "roles">): Role[] {
    return this.ownerIds.includes(user.id) ? [...new Set<Role>(["admin", ...user.roles])] : user.roles;
  }

  /** Everyone who should hear about something that needs the given role (owners hear everything). */
  staffIds(...roles: Role[]): number[] {
    const ids = new Set(this.ownerIds);
    for (const role of [...roles, "admin" as const]) {
      for (const user of this.store.users.withRole(role)) ids.add(user.id);
    }
    return [...ids];
  }

  async place(userId: number, input: unknown): Promise<Order> {
    const parsed = placeOrderSchema.safeParse(input);
    if (!parsed.success) throw new UserError(parsed.error.issues[0]!.message);
    const request = parsed.data;

    const quantities = new Map<number, number>();
    for (const item of request.items) quantities.set(item.id, (quantities.get(item.id) ?? 0) + item.quantity);

    const settings = this.store.settings.get();
    const lowStock: { title: string; titleCyr: string; stock: number }[] = [];

    const orderId = this.store.transaction(() => {
      const lines: OrderLine[] = [];
      for (const [id, quantity] of quantities) {
        const product = this.store.catalog.getProduct(id);
        if (!product?.active) throw new UserError("Ba'zi mahsulotlar endi sotuvda yo'q. Savatni tekshiring.", 409);
        if (!this.store.catalog.takeStock(id, quantity)) {
          throw new UserError(`"${product.title}" dan faqat ${product.stock} dona qoldi.`, 409);
        }
        if (product.stock !== null) {
          const left = product.stock - quantity;
          if (left <= settings.lowStockThreshold) lowStock.push({ ...product, stock: left });
        }
        lines.push({ productId: id, title: product.title, titleCyr: product.titleCyr, price: product.price, quantity });
      }

      const delivery = request.fulfillment === "delivery";
      this.store.users.saveProfile(userId, {
        name: request.name,
        phone: request.phone,
        address: delivery && request.address ? request.address : undefined,
      });

      return this.store.orders.insert({
        userId,
        fulfillment: request.fulfillment,
        payment: request.payment,
        name: request.name,
        phone: request.phone,
        address: delivery ? request.address : "",
        latitude: delivery ? (request.latitude ?? null) : null,
        longitude: delivery ? (request.longitude ?? null) : null,
        note: request.note,
        deliveryFee: delivery ? settings.deliveryFee : 0,
        lines,
      });
    });

    const order = this.store.orders.get(orderId)!;
    await this.notifyPlaced(order);
    for (const item of lowStock) {
      for (const id of this.staffIds()) {
        await this.notifier.send(id, (cyr) => `⚠️ Kam qoldi: <b>${escapeHtml(titleIn(item, cyr, toCyrillic))}</b> — ${item.stock} dona`, {
          text: "Mahsulotlar",
          screen: "admin",
        });
      }
    }
    return order;
  }

  async transition(orderId: number, to: OrderStatus, actor: User): Promise<Order> {
    const order = this.store.orders.get(orderId);
    if (!order) throw new UserError("Buyurtma topilmadi.", 404);

    const roles = this.rolesOf(actor);
    const isOwner = order.userId === actor.id;
    if (!findTransition(order, to, { roles, isOwner })) {
      throw new UserError("Bu amalni hozir bajarib bo'lmaydi. Sahifani yangilang.", 409);
    }

    this.store.transaction(() => {
      if (to === "cancelled") {
        for (const line of order.lines) this.store.catalog.returnStock(line.productId, line.quantity);
      }
      this.store.orders.setStatus(orderId, to, actor.id, {
        paid: to === "completed" ? true : undefined,
        driverId: to === "delivering" ? actor.id : undefined,
      });
    });

    const updated = this.store.orders.get(orderId)!;
    await this.notifyTransition(updated, isOwner && !roles.length);
    return updated;
  }

  private async notifyPlaced(order: Order): Promise<void> {
    const pickup = order.fulfillment === "pickup";
    await this.notifier.send(
      order.userId,
      (cyr) => [
        `✅ Buyurtmangiz <b>№${order.id}</b> qabul qilindi!`,
        "",
        lineText(order.lines, cyr),
        "",
        `Jami: <b>${formatMoney(order.total)}</b>`,
        pickup ? "Tayyor bo'lganda shu yerga xabar yuboramiz." : "Tez orada yetkazib beramiz.",
      ].join("\n"),
      { text: "Buyurtmalarim", screen: "orders" },
    );

    const text = (cyr: boolean) => [
      `🆕 <b>Yangi buyurtma №${order.id}</b>`,
      pickup ? "🏠 O'zi olib ketadi" : "🚚 Yetkazib berish",
      `👤 ${escapeHtml(order.name)}, ${escapeHtml(order.phone)}`,
      pickup ? "" : `📍 <a href="${escapeHtml(mapsUrl(order))}">${escapeHtml(order.address || "Xaritada")}</a>`,
      "",
      lineText(order.lines, cyr),
      "",
      `💰 ${formatMoney(order.total)} · ${PAYMENT_LABELS[order.payment]}`,
      order.note ? `💬 ${escapeHtml(order.note)}` : "",
    ]
      .filter((line, i, all) => line !== "" || all[i - 1] !== "")
      .join("\n");
    for (const id of this.staffIds("seller")) {
      await this.notifier.send(id, text, { text: "Sotuvchi ekrani", screen: "seller" });
    }
  }

  private async notifyTransition(order: Order, byCustomer: boolean): Promise<void> {
    const n = `№${order.id}`;
    const settings = this.store.settings.get();

    switch (order.status) {
      case "ready":
        if (order.fulfillment === "pickup") {
          await this.notifier.send(
            order.userId,
            [
              `✅ Buyurtmangiz <b>${n}</b> tayyor! Olib ketishingiz mumkin.`,
              settings.pickupAddress ? `📍 ${escapeHtml(settings.pickupAddress)}` : "",
              settings.pickupHours ? `🕘 ${escapeHtml(settings.pickupHours)}` : "",
              settings.phone ? `📞 ${escapeHtml(settings.phone)}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          );
        } else {
          await this.notifier.send(order.userId, `✅ Buyurtmangiz <b>${n}</b> tayyor. Tez orada yo'lga chiqamiz.`);
          for (const id of this.staffIds("driver")) {
            await this.notifier.send(
              id,
              `🚚 Yetkazish kerak: <b>${n}</b>\n📍 ${escapeHtml(order.address || "Xaritada")}\n💰 ${formatMoney(order.total)}`,
              { text: "Haydovchi ekrani", screen: "driver" },
            );
          }
        }
        return;
      case "delivering":
        await this.notifier.send(order.userId, `🚚 Buyurtmangiz <b>${n}</b> yo'lda!`);
        return;
      case "completed":
        await this.notifier.send(order.userId, `🎉 Buyurtma <b>${n}</b> topshirildi. Xaridingiz uchun rahmat!`, {
          text: "Yana buyurtma berish",
          screen: "shop",
        });
        return;
      case "cancelled":
        if (byCustomer) {
          for (const id of this.staffIds("seller")) {
            await this.notifier.send(id, `❌ Mijoz buyurtma <b>${n}</b> ni bekor qildi.`);
          }
        } else {
          await this.notifier.send(
            order.userId,
            `❌ Buyurtmangiz <b>${n}</b> bekor qilindi.${settings.phone ? `\nSavollar uchun: ${escapeHtml(settings.phone)}` : ""}`,
          );
        }
        return;
    }
  }
}
