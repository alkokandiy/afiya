import { Bot } from "grammy";
import { createApp } from "./api.js";
import { createBot, registerCommands } from "./bot.js";
import { Checkout } from "./checkout.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { Store } from "./store.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
const store = new Store(db);

const bot = new Bot(config.botToken);
const checkout = new Checkout(store, bot.api, config.adminChatIds);
createBot(bot, store, checkout, config);

const server = createApp(store, checkout, config).listen(config.port, () => {
  console.log(`HTTP API listening on :${config.port}`);
});

await registerCommands(bot, config);
void bot.start({
  onStart: (me) => console.log(`Bot @${me.username} is polling`),
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  await bot.stop();
  server.close();
  db.close();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
