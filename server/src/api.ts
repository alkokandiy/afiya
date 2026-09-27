import express, { type ErrorRequestHandler } from "express";
import { GrammyError } from "grammy";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Checkout } from "./checkout.js";
import { CartError, type Store } from "./store.js";
import { validateInitData } from "./telegram-auth.js";

export function createApp(store: Store, checkout: Checkout, options: { botToken: string }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/products", (_req, res) => {
    const products = store.listProducts().map(({ id, title, price, image }) => ({ id, title, price, image }));
    res.set("Cache-Control", "public, max-age=60").json(products);
  });

  // Used when the Mini App was opened from an inline/menu button, where Telegram.WebApp.sendData isn't available.
  // The caller proves who they are with the signed initData Telegram gave the Mini App.
  app.post("/api/checkout", async (req, res) => {
    const [scheme, initData] = (req.get("authorization") ?? "").split(" ");
    const user = scheme === "tma" && initData ? validateInitData(initData, options.botToken) : null;
    if (!user) {
      res.status(401).json({ error: "Telegram orqali oching." });
      return;
    }

    try {
      await checkout.start(user.id, req.body?.items);
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof CartError) {
        res.status(400).json({ error: error.message });
      } else if (error instanceof GrammyError && error.error_code === 403) {
        res.status(409).json({ error: "Avval botga /start yozing, keyin qayta urinib ko'ring." });
      } else {
        throw error;
      }
    }
  });

  // After `npm run build` in client/, the server also serves the shop itself, so both share one origin.
  const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
  if (fs.existsSync(clientDist)) app.use(express.static(clientDist));

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error("API error:", error);
    res.status(500).json({ error: "Xatolik yuz berdi. Qayta urinib ko'ring." });
  };
  app.use(onError);

  return app;
}
