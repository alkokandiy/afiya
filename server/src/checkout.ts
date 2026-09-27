import { InlineKeyboard, Keyboard, type Api } from "grammy";
import { formatCustomer, formatLines, formatMoney, formatOrder, STATUS_LABELS } from "./format.js";
import {
  CartError,
  parseCartItems,
  type Customer,
  type Location,
  type Order,
  type OrderStatus,
  type PricedCart,
  type Store,
} from "./store.js";

const html = { parse_mode: "HTML" } as const;
const removeKeyboard = { reply_markup: { remove_keyboard: true } } as const;

const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["delivering", "cancelled"],
  delivering: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function statusKeyboard(order: Order): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const status of NEXT_STATUSES[order.status]) {
    keyboard.text(STATUS_LABELS[status], `status:${order.id}:${status}`);
  }
  return keyboard;
}

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return input.trim().startsWith("+") || digits.length > 9 ? `+${digits}` : digits;
}

/** The order conversation: cart from the web app → name → phone → location → review → confirm. */
export class Checkout {
  constructor(
    private readonly store: Store,
    private readonly api: Api,
    private readonly adminChatIds: number[],
  ) {}

  /** Entry point for a cart coming from the web app (either transport). Throws CartError on bad input. */
  async start(chatId: number, rawItems: unknown): Promise<void> {
    const items = parseCartItems(rawItems);
    const cart = this.store.priceCart(items);
    const customer = this.store.getCustomer(chatId);

    if (customer) {
      this.store.saveSession(chatId, { step: "review", items, draft: {} });
      await this.sendReview(chatId, cart, customer);
    } else {
      this.store.saveSession(chatId, { step: "name", items, draft: {} });
      await this.api.sendMessage(chatId, this.cartSummary(cart), html);
      await this.askName(chatId);
    }
  }

  /** Returns false when the chat has no checkout in progress, so the caller can handle the message itself. */
  async handleText(chatId: number, text: string): Promise<boolean> {
    const session = this.store.getSession(chatId);
    if (!session || session.step === "review") return false;

    if (session.step === "name") {
      const name = text.trim();
      if (name.length < 2 || name.length > 64) {
        await this.api.sendMessage(chatId, "✏️ Iltimos, ismingizni to'g'ri kiriting (2–64 belgi).");
        return true;
      }
      this.store.saveSession(chatId, { ...session, step: "phone", draft: { ...session.draft, name } });
      await this.askPhone(chatId);
      return true;
    }

    if (session.step === "phone") {
      const phone = normalizePhone(text);
      if (!phone) {
        await this.api.sendMessage(chatId, "📞 Raqam noto'g'ri. Masalan: +998 90 123 45 67");
        return true;
      }
      this.store.saveSession(chatId, { ...session, step: "location", draft: { ...session.draft, phone } });
      await this.askLocation(chatId);
      return true;
    }

    const address = text.trim();
    if (address.length < 5 || address.length > 300) {
      await this.api.sendMessage(chatId, "📍 Iltimos, manzilni to'liqroq yozing yoki GPS joylashuvni yuboring.");
      return true;
    }
    await this.finishDetails(chatId, { kind: "text", address });
    return true;
  }

  async handleContact(chatId: number, phoneNumber: string): Promise<boolean> {
    const session = this.store.getSession(chatId);
    if (session?.step !== "phone") return false;
    return this.handleText(chatId, phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`);
  }

  async handleLocation(chatId: number, latitude: number, longitude: number): Promise<boolean> {
    const session = this.store.getSession(chatId);
    if (session?.step !== "location") return false;
    await this.finishDetails(chatId, { kind: "geo", latitude, longitude });
    return true;
  }

  async changeDetails(chatId: number): Promise<void> {
    const session = this.store.getSession(chatId);
    if (!session) return this.sendExpired(chatId);
    this.store.saveSession(chatId, { ...session, step: "name", draft: {} });
    await this.askName(chatId);
  }

  async confirm(chatId: number): Promise<void> {
    const session = this.store.getSession(chatId);
    const customer = this.store.getCustomer(chatId);
    if (session?.step !== "review" || !customer) return this.sendExpired(chatId);

    let order: Order;
    try {
      // Re-price at confirmation time: an admin may have changed prices since the review was shown.
      order = this.store.createOrder(chatId, customer, this.store.priceCart(session.items));
    } catch (error) {
      if (!(error instanceof CartError)) throw error;
      this.store.clearSession(chatId);
      await this.api.sendMessage(chatId, `⚠️ ${error.message}`);
      return;
    }
    // Cleared synchronously with the insert, so a second tap on "Tasdiqlash" can't create a duplicate.
    this.store.clearSession(chatId);

    await this.api.sendMessage(
      chatId,
      `✅ Buyurtma #${order.id} qabul qilindi! Holati o'zgarganda shu yerda xabar beramiz.`,
    );
    await this.notifyAdmins(order);
  }

  async setStatus(orderId: number, status: OrderStatus): Promise<Order | undefined> {
    const current = this.store.getOrder(orderId);
    if (!current || !NEXT_STATUSES[current.status].includes(status)) return undefined;

    const order = this.store.setOrderStatus(orderId, status)!;
    await this.api
      .sendMessage(order.chatId, `Buyurtma #${order.id} holati: ${STATUS_LABELS[status]}`)
      .catch((error) => console.error(`Could not notify customer of order #${order.id}:`, error));
    return order;
  }

  private async finishDetails(chatId: number, location: Location): Promise<void> {
    const session = this.store.getSession(chatId)!;
    const { name, phone } = session.draft;
    if (!name || !phone) {
      // Only reachable if the session was tampered with; restart the details.
      return this.changeDetails(chatId);
    }

    const customer: Customer = { name, phone, location };
    this.store.saveCustomer(chatId, customer);
    this.store.saveSession(chatId, { ...session, step: "review", draft: {} });
    await this.api.sendMessage(chatId, "✅ Ma'lumotlar saqlandi.", removeKeyboard);

    try {
      await this.sendReview(chatId, this.store.priceCart(session.items), customer);
    } catch (error) {
      if (!(error instanceof CartError)) throw error;
      this.store.clearSession(chatId);
      await this.api.sendMessage(chatId, `⚠️ ${error.message}`);
    }
  }

  private cartSummary(cart: PricedCart): string {
    return `🛍 <b>Buyurtmangiz</b>\n\n${formatLines(cart.lines)}\n\n💰 <b>Jami: ${formatMoney(cart.total)}</b>`;
  }

  private async sendReview(chatId: number, cart: PricedCart, customer: Customer): Promise<void> {
    await this.api.sendMessage(
      chatId,
      `${this.cartSummary(cart)}\n\n<b>Yetkazish ma'lumotlari</b>\n${formatCustomer(customer)}`,
      {
        ...html,
        link_preview_options: { is_disabled: true },
        reply_markup: new InlineKeyboard()
          .text("✅ Tasdiqlash", "confirm_order")
          .row()
          .text("📝 Ma'lumotlarni o'zgartirish", "change_info"),
      },
    );
  }

  private askName(chatId: number) {
    return this.api.sendMessage(chatId, "👤 Ismingizni kiriting:", removeKeyboard);
  }

  private askPhone(chatId: number) {
    return this.api.sendMessage(chatId, "📞 Telefon raqamingizni yuboring yoki yozing:", {
      reply_markup: new Keyboard().requestContact("📱 Raqamni yuborish").resized().oneTime(),
    });
  }

  private askLocation(chatId: number) {
    return this.api.sendMessage(chatId, "📍 Manzilingizni yozing yoki joylashuvni yuboring:", {
      reply_markup: new Keyboard().requestLocation("📍 Joylashuvni yuborish").resized().oneTime(),
    });
  }

  private async sendExpired(chatId: number): Promise<void> {
    await this.api.sendMessage(chatId, "Bu buyurtma eskirgan. Mahsulotlarni qaytadan tanlang: /start");
  }

  private async notifyAdmins(order: Order): Promise<void> {
    for (const adminId of this.adminChatIds) {
      try {
        await this.api.sendMessage(adminId, `📦 <b>Yangi buyurtma!</b>\n\n${formatOrder(order)}`, {
          ...html,
          link_preview_options: { is_disabled: true },
          reply_markup: statusKeyboard(order),
        });
        if (order.location.kind === "geo") {
          await this.api.sendLocation(adminId, order.location.latitude, order.location.longitude);
        }
      } catch (error) {
        console.error(`Could not notify admin ${adminId} of order #${order.id}:`, error);
      }
    }
  }
}
