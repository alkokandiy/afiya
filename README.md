# Afiya Market

A Telegram Mini App shop for Afiya's household products. Customers browse, fill a cart and order inside
Telegram; the family packs, delivers or hands the order over at home, and everyone is kept up to date by the bot.

```
client/   React 19 + Vite + TypeScript Mini App (customer shop + staff screens)
server/   Express + grammY bot + SQLite, TypeScript
shared/   Code both sides use: order rules, API types, Latin⇄Cyrillic transliteration
```

## For customers

- **Shop:** big pictures and buttons, categories, search (works in Latin or Cyrillic), "only N left" / sold-out labels.
- **Cart** is kept on the phone, so closing Telegram doesn't lose it.
- **Checkout on one screen:** delivery to the door or pickup from home → name, phone
  (or "send my Telegram number"), address (or "send my location") → cash or card transfer on handover.
  Details are remembered for next time.
- **Buyurtmalar (my orders):** progress steps (Qabul qilindi → Tayyor → Yo'lda → Topshirildi), cancel while
  still new, "order the same again", a call button for the shop.
- **Lotin / Кирилл** switch in the header; the bot's messages follow the same choice.

## For staff ("Ish joyi" tab — only visible to people with a role)

| Screen | Who | What |
|---|---|---|
| 📦 Sotuvchi | seller | orders to pack → "Yig'ildi, tayyor"; pickups waiting → "Topshirildi, pul olindi" |
| 🚚 Haydovchi | driver | ready deliveries → "Olib ketdim" → "Yetkazildi, pul olindi"; call and map buttons |
| ⚙️ Admin | admin | report (today / 7 days, low stock, best sellers), products (photo, price, stock, Cyrillic name, show/hide), categories, all orders, staff roles, shop settings |

Order flow: `new → ready → (delivering) → completed`, or `cancelled` (stock goes back). Who may press what
is defined once in `shared/types.ts` (`TRANSITIONS`) and enforced by the server.

Bot notifications: new orders to sellers and admins, ready deliveries to drivers, every status change to the
customer, and a low-stock warning to admins.

**Adding staff:** the person sends `/start` to the bot (or opens the shop once), then an admin ticks their role in
Admin → Xodimlar. The IDs in `ADMIN_CHAT_IDS` are owners: always admin.

## Running locally

Telegram only opens Mini Apps over HTTPS, so the shop has to be reachable through a tunnel
(e.g. [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) or ngrok).

```bash
npm run install:all
# server/.env holds BOT_TOKEN and ADMIN_CHAT_IDS (template: server/.env.example)
npm run dev:client                               # Vite on :5173, forwards /api and /uploads to :8000
cloudflared tunnel --url http://localhost:5173   # prints an https://….trycloudflare.com URL
# put that URL in server/.env as CLIENT_URL, then:
npm run dev:server                               # bot + API on :8000
npm test                                         # both test suites
```

Without the dev server: `npm run build && npm start` serves the built shop from the server itself on :8000,
so tunnel port 8000 instead.

## Deploying to Railway

The whole app is one Railway service: the server serves the shop, the API and the bot. `railway.json` holds the
build and start commands.

1. New project → **Deploy from GitHub repo** → this repository (root directory: the repo root).
2. **Settings → Networking → Generate Domain.** That `https://….up.railway.app` address becomes the shop's URL automatically.
3. **Add a volume** (right-click the service → Attach volume, mount path e.g. `/data`). The database and uploaded
   photos live there; without it they are wiped on every deploy (the logs warn about this).
4. **Variables:** `BOT_TOKEN` and `ADMIN_CHAT_IDS`. `PORT`, `CLIENT_URL` and `DATA_DIR` come from Railway.
5. Deploy. `/health` is the health check; the bot's menu button is pointed at the Railway URL on start.

Only one copy of the bot can poll Telegram at a time: stop a local `npm run dev:server` using the same token while
Railway runs it (or use a second test bot locally).

## Configuration (`server/.env`)

| Variable | |
|---|---|
| `BOT_TOKEN` | from @BotFather |
| `ADMIN_CHAT_IDS` | comma-separated Telegram user IDs of the owners (always admin) |
| `CLIENT_URL` | HTTPS URL of the shop; used for every web-app button (Railway: its public domain) |
| `DATA_DIR` | database (`afiya.db`) and uploaded photos (`uploads/`), default `./data` (Railway: the volume) — back this up |
| `PORT` | default `8000` |

Shop phone, pickup address and hours, delivery fee and the low-stock threshold are set in Admin → Sozlamalar.
