import { Bot } from "grammy";
import path from "node:path";
import { createBot, registerBotUi } from "./bot.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { createApp } from "./http/app.js";
import { TelegramNotifier } from "./notifier.js";
import { OrderService } from "./order-service.js";
import { Store } from "./store/index.js";

const config = loadConfig();
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
const server = app.listen(config.port, () => console.log(`HTTP API listening on :${config.port}`));

await registerBotUi(bot, config.clientUrl);
void bot.start({ onStart: (me) => console.log(`Bot @${me.username} is polling`) });

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  await bot.stop();
  server.close();
  db.close();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
