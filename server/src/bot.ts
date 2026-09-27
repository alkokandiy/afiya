import { Bot, GrammyError, HttpError, InlineKeyboard, type Context } from "grammy";
import { statusKeyboard, type Checkout } from "./checkout.js";
import type { Config } from "./config.js";
import { escapeHtml, formatMoney, formatOrder, STATUS_LABELS } from "./format.js";
import { CartError, ORDER_STATUSES, type OrderStatus, type Store } from "./store.js";

const html = { parse_mode: "HTML" } as const;

export function createBot(bot: Bot, store: Store, checkout: Checkout, config: Config): Bot {
  const isAdmin = (ctx: Context) => ctx.chat !== undefined && config.adminChatIds.includes(ctx.chat.id);
  const shopButton = () => new InlineKeyboard().webApp("🛒 Mahsulotlarni ko'rish", config.clientUrl);

  bot.command("start", (ctx) =>
    ctx.reply("Afiya Marketga xush kelibsiz!", {
      reply_markup: {
        keyboard: [[{ text: "🛒 Mahsulotlarni ko'rish", web_app: { url: config.clientUrl } }]],
        resize_keyboard: true,
        is_persistent: true,
      },
    }),
  );

  bot.command("mahsulotlar", (ctx) => ctx.reply("Barcha mahsulotlar:", { reply_markup: shopButton() }));

  // --- admin commands ---

  const admin = bot.filter(isAdmin);

  admin.command("products", async (ctx) => {
    const lines = store
      .listProducts({ includeInactive: true })
      .map((p) => `${p.active ? "" : "🚫 "}<code>${p.id}</code> ${escapeHtml(p.title)} — ${formatMoney(p.price)}`);
    await ctx.reply(`${lines.join("\n")}\n\n/price &lt;id&gt; &lt;narx&gt; · /hide &lt;id&gt; · /show &lt;id&gt;`, html);
  });

  admin.command("price", async (ctx) => {
    const [id, price] = ctx.match.split(/\s+/).map(Number);
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(price) || price! <= 0) {
      return ctx.reply("Foydalanish: /price <id> <narx>, masalan /price 3 56000");
    }
    const ok = store.setPrice(id!, price!);
    await ctx.reply(ok ? `✅ #${id} narxi: ${formatMoney(price!)}` : `Mahsulot #${id} topilmadi.`);
  });

  for (const [command, active] of [["hide", false], ["show", true]] as const) {
    admin.command(command, async (ctx) => {
      const id = Number(ctx.match.trim());
      const ok = Number.isSafeInteger(id) && store.setActive(id, active);
      await ctx.reply(ok ? `✅ #${id} ${active ? "ko'rsatildi" : "yashirildi"}.` : `Foydalanish: /${command} <id>`);
    });
  }

  admin.command("orders", async (ctx) => {
    const orders = store.listRecentOrders(10);
    if (orders.length === 0) return ctx.reply("Hali buyurtmalar yo'q.");
    const lines = orders.map(
      (o) => `#${o.id} · ${STATUS_LABELS[o.status]} · ${escapeHtml(o.name)} · ${formatMoney(o.total)} · /order_${o.id}`,
    );
    await ctx.reply(lines.join("\n"), html);
  });

  admin.hears(/^\/order_(\d+)/, async (ctx) => {
    const order = store.getOrder(Number(ctx.match[1]));
    if (!order) return ctx.reply("Buyurtma topilmadi.");
    await ctx.reply(formatOrder(order), {
      ...html,
      link_preview_options: { is_disabled: true },
      reply_markup: statusKeyboard(order),
    });
  });

  bot.callbackQuery(/^status:(\d+):(\w+)$/, async (ctx) => {
    const status = ctx.match[2] as OrderStatus;
    if (!isAdmin(ctx) || !ORDER_STATUSES.includes(status)) return ctx.answerCallbackQuery();

    const order = await checkout.setStatus(Number(ctx.match[1]), status);
    if (!order) return ctx.answerCallbackQuery({ text: "Bu holatni o'zgartirib bo'lmaydi." });
    await ctx.answerCallbackQuery({ text: STATUS_LABELS[status] });
    await ctx.editMessageText(formatOrder(order), {
      ...html,
      link_preview_options: { is_disabled: true },
      reply_markup: statusKeyboard(order),
    });
  });

  // --- customer checkout ---

  bot.on("message:web_app_data", async (ctx) => {
    let items: unknown;
    try {
      items = (JSON.parse(ctx.message.web_app_data.data) as { items?: unknown }).items;
    } catch {
      items = undefined;
    }
    await checkout.start(ctx.chat.id, items);
  });

  bot.callbackQuery("confirm_order", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup(); // drop the buttons so the review can't be confirmed twice
    await checkout.confirm(ctx.chat!.id);
  });

  bot.callbackQuery("change_info", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup();
    await checkout.changeDetails(ctx.chat!.id);
  });

  bot.on("message:contact", async (ctx) => {
    if (!(await checkout.handleContact(ctx.chat.id, ctx.message.contact.phone_number))) {
      await ctx.reply("Mahsulotlarni ko'rish uchun:", { reply_markup: shopButton() });
    }
  });

  bot.on("message:location", async (ctx) => {
    const { latitude, longitude } = ctx.message.location;
    if (!(await checkout.handleLocation(ctx.chat.id, latitude, longitude))) {
      await ctx.reply("Mahsulotlarni ko'rish uchun:", { reply_markup: shopButton() });
    }
  });

  bot.on("message:text", async (ctx) => {
    if (await checkout.handleText(ctx.chat.id, ctx.message.text)) return;
    await ctx.reply("Quyidagi tugma orqali mahsulotlarni ko'rishingiz mumkin:", { reply_markup: shopButton() });
  });

  bot.catch(async ({ ctx, error }) => {
    if (error instanceof CartError) {
      await ctx.reply(`⚠️ ${error.message}`, { reply_markup: shopButton() }).catch(() => {});
      return;
    }
    if (error instanceof GrammyError || error instanceof HttpError) {
      console.error(`Telegram error while handling update ${ctx.update.update_id}:`, error.message);
    } else {
      console.error(`Error while handling update ${ctx.update.update_id}:`, error);
    }
    await ctx.reply("❌ Xatolik yuz berdi. Qayta urinib ko'ring.").catch(() => {});
  });

  return bot;
}

export async function registerCommands(bot: Bot, config: Config): Promise<void> {
  const customerCommands = [
    { command: "start", description: "Botni ishga tushirish" },
    { command: "mahsulotlar", description: "Mahsulotlarni ko'rish" },
  ];
  await bot.api.setMyCommands(customerCommands);
  await bot.api.setChatMenuButton({
    menu_button: { type: "web_app", text: "Do'kon", web_app: { url: config.clientUrl } },
  });

  for (const chatId of config.adminChatIds) {
    await bot.api
      .setMyCommands(
        [
          ...customerCommands,
          { command: "orders", description: "Oxirgi buyurtmalar" },
          { command: "products", description: "Mahsulotlar va narxlar" },
          { command: "price", description: "Narxni o'zgartirish: /price <id> <narx>" },
          { command: "hide", description: "Mahsulotni yashirish: /hide <id>" },
          { command: "show", description: "Mahsulotni ko'rsatish: /show <id>" },
        ],
        { scope: { type: "chat", chat_id: chatId } },
      )
      .catch((error) => console.error(`Could not set admin commands for ${chatId} (has the admin started the bot?):`, error.message));
  }
}
