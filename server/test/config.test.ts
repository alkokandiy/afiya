import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { BOT_TOKEN: "123:abc", ADMIN_CHAT_IDS: "1, 2" };

describe("loadConfig", () => {
  it("reads a local setup", () => {
    expect(loadConfig({ ...base, CLIENT_URL: "https://x.trycloudflare.com/" })).toEqual({
      botToken: "123:abc",
      adminChatIds: [1, 2],
      clientUrl: "https://x.trycloudflare.com",
      dataDir: "./data",
      port: 8000,
      ephemeralData: false,
    });
  });

  it("uses Railway's domain, volume and port", () => {
    const config = loadConfig({
      ...base,
      PORT: "3000",
      RAILWAY_ENVIRONMENT_NAME: "production",
      RAILWAY_PUBLIC_DOMAIN: "afiya.up.railway.app",
      RAILWAY_VOLUME_MOUNT_PATH: "/data",
    });
    expect(config).toMatchObject({ clientUrl: "https://afiya.up.railway.app", dataDir: "/data", port: 3000, ephemeralData: false });
  });

  it("flags Railway without a volume", () => {
    const config = loadConfig({ ...base, RAILWAY_ENVIRONMENT_NAME: "production", RAILWAY_PUBLIC_DOMAIN: "a.up.railway.app" });
    expect(config.ephemeralData).toBe(true);
  });

  it("explains what's missing", () => {
    expect(() => loadConfig({ BOT_TOKEN: "nope" })).toThrow(/BOT_TOKEN[\s\S]*ADMIN_CHAT_IDS[\s\S]*CLIENT_URL/);
    expect(() => loadConfig({ ...base, CLIENT_URL: "http://localhost:5173" })).toThrow(/https/);
  });
});
