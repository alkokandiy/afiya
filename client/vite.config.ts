import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    // The API is always same-origin: in development through this proxy, after a build the server serves the client.
    proxy: { "/api": "http://localhost:8000" },
    // Telegram needs HTTPS, so in development the dev server is reached through a tunnel.
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.app"],
  },
});
