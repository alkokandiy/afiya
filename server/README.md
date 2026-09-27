# afiya-server

Telegram bot + HTTP API for Afiya Market. See the root README for the full picture.

```bash
cp .env.example .env   # fill in BOT_TOKEN and ADMIN_CHAT_IDS
npm install
npm run dev
```

| Script | |
|---|---|
| `npm run dev` | watch mode with `.env` loaded |
| `npm run build` / `npm start` | compile to `dist/` and run it; also serves `client/dist` if built |
| `npm test` | vitest |
| `npm run typecheck` | tsc without emitting |
