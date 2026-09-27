# Afiya Market

A Telegram Mini App shop: customers browse products inside Telegram, fill a cart, and the bot collects
their name, phone and address, then forwards the order to the admins, who move it through its statuses.

```
client/   React 19 + Vite + TypeScript Mini App
server/   Express + grammY bot + SQLite, TypeScript
```

## How it works

1. The customer opens the shop from the bot: the `/start` keyboard button, the chat menu button, or an inline button.
2. The client loads products and prices from `GET /api/products`.
3. On checkout the client sends only product IDs and quantities:
   - opened from the keyboard button → `Telegram.WebApp.sendData`, delivered to the bot as `web_app_data`;
   - opened any other way → `POST /api/checkout`, authenticated with Telegram's signed `initData`.
4. The server prices the cart from its own database, then continues in the chat:
   name → phone (typed or shared contact) → address (typed or GPS) → review → confirm.
   Returning customers go straight to the review and can change their details there.
5. The confirmed order is saved and sent to every admin chat with status buttons
   (Tasdiqlandi → Yetkazilmoqda → Yetkazildi, or Bekor qilindi). The customer is told about each change.

State (products, customers, checkout progress, orders) lives in SQLite, so restarts lose nothing.

## Running locally

Telegram only opens Mini Apps over HTTPS, so the shop has to be reachable through a tunnel
(e.g. [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) or ngrok).

```bash
npm run install:all
# server/.env holds BOT_TOKEN and ADMIN_CHAT_IDS (template: server/.env.example)
npm run dev:client                               # Vite on :5173, forwards /api to :8000
cloudflared tunnel --url http://localhost:5173   # prints an https://….trycloudflare.com URL
# put that URL in server/.env as CLIENT_URL, then:
npm run dev:server                               # bot + API on :8000
npm test                                         # both test suites
```

Without the dev server: `npm run build && npm start` serves the built shop from the server itself on :8000,
so tunnel port 8000 instead.

## Configuration (`server/.env`)

| Variable | |
|---|---|
| `BOT_TOKEN` | from @BotFather |
| `ADMIN_CHAT_IDS` | comma-separated chat IDs that receive orders and may use admin commands |
| `CLIENT_URL` | HTTPS URL of the shop; used for every web-app button |
| `DATABASE_PATH` | SQLite file, default `./data/afiya.db` |
| `PORT` | default `8000` |

## Admin commands

Available in the chats listed in `ADMIN_CHAT_IDS`:

| Command | |
|---|---|
| `/orders` | last 10 orders; tap `/order_<id>` to open one with its status buttons |
| `/products` | catalog with IDs, prices, hidden items |
| `/price <id> <price>` | change a price, e.g. `/price 3 56000` |
| `/hide <id>` / `/show <id>` | take a product off the shop or put it back |

New products: add a row to the `products` table and an image at `client/public/img/products/<id>.webp`.
