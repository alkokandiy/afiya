import { Bot, GrammyError, HttpError, InlineKeyboard } from "grammy";
import { toCyrillic } from "../../shared/translit.js";
import { htmlToCyrillic } from "./notifier.js";
import type { Store } from "./store/index.js";

const WELCOME = `Assalomu alaykum! 👋\n\n<b>Buyurtma berish uchun pastdagi tugmani bosing</b> 👇`;

export function createBot(bot: Bot, store: Store, clientUrl: string): Bot {
  const shopKeyboard = (cyrillic: boolean) =>
    new InlineKeyboard()
      .webApp(cyrillic ? toCyrillic("🛒 Do'konni ochish") : "🛒 Do'konni ochish", `${clientUrl}/?screen=shop`)
      .row()
      .webApp(cyrillic ? toCyrillic("📦 Buyurtmalarim") : "📦 Buyurtmalarim", `${clientUrl}/?screen=orders`);

  // Any message gets the same friendly answer: the shop buttons. Everything else happens in the Mini App.
  // Recording the sender also lets the admin pick them as staff (e.g. a new seller just sends /start).
  bot.on("message", async (ctx) => {
    const cyrillic = store.users.touch(ctx.from.id, ctx.from.first_name, ctx.from.username ?? null).script === "cyrl";
    await ctx.reply(cyrillic ? htmlToCyrillic(WELCOME) : WELCOME, {
      parse_mode: "HTML",
      reply_markup: shopKeyboard(cyrillic),
    });
  });

  bot.catch(({ ctx, error }) => {
    const message = error instanceof GrammyError || error instanceof HttpError ? error.message : error;
    console.error(`Error while handling update ${ctx.update.update_id}:`, message);
  });

  return bot;
}

export async function registerBotUi(bot: Bot, clientUrl: string): Promise<void> {
  await bot.api.setMyCommands([{ command: "start", description: "Do'konni ochish" }]);
  await bot.api.setChatMenuButton({
    menu_button: { type: "web_app", text: "Do'kon", web_app: { url: `${clientUrl}/?screen=shop` } },
  });
}
