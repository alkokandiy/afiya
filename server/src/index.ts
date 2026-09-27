import { Bot, GrammyError } from "grammy";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createBot, registerBotUi } from "./bot.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { createApp } from "./http/app.js";
import { TelegramNotifier } from "./notifier.js";
import { OrderService } from "./order-service.js";
import { Store } from "./store/index.js";

const config = loadConfig();
if (config.ephemeralData) {
  console.warn("⚠️  No Railway volume attached: orders, users and photos will be LOST on the next deploy. Add a volume.");
}
const db = openDatabase(path.join(config.dataDir, "afiya.db"));
const store = new Store(db);

const bot = new Bot(config.botToken);
const orders = new OrderService(store, new TelegramNotifier(bot.api, store, config.clientUrl), config.adminChatIds);
createBot(bot, store, config.clientUrl);

const app = createApp(store, orders, {
  botToken: config.botToken,
  ownerIds: config.adminChatIds,
  uploadsDir: path.resolve(config.dataDir, "uploads"),
  // npm scripts run with server/ as the working directory.
  clientDist: path.resolve("../client/dist"),
});
const server = app.listen(config.port, () => console.log(`Shop and API listening on :${config.port} → ${config.clientUrl}`));

let stopping = false;

// During a redeploy the previous instance keeps polling for a few seconds, and Telegram answers 409 until it
// stops; any other failure (network, Telegram outage) is retried too instead of taking the shop down.
async function pollForever() {
  while (!stopping) {
    try {
      await bot.start({ onStart: (me) => console.log(`Bot @${me.username} is polling`) });
      return;
    } catch (error) {
      if (stopping) return;
      if (error instanceof GrammyError && error.error_code === 409) {
        console.warn("Another instance is still polling; retrying in 5s");
      } else {
        console.error("Bot stopped, retrying in 5s:", error);
      }
      await sleep(5000);
    }
  }
}

registerBotUi(bot, config.clientUrl).catch((error) => console.error("Could not set the bot's menu button:", error.message));
void pollForever();

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  stopping = true;
  await bot.stop().catch(() => {});
  server.close();
  db.close();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
