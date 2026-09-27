import { z } from "zod";

const schema = z.object({
  BOT_TOKEN: z.string().regex(/^\d+:[\w-]+$/, "BOT_TOKEN must look like 123456:ABC..."),
  ADMIN_CHAT_IDS: z
    .string()
    .min(1, "ADMIN_CHAT_IDS needs at least one chat ID")
    .transform((value, ctx) => {
      const ids = value.split(",").map((part) => Number(part.trim()));
      if (ids.some((id) => !Number.isSafeInteger(id))) {
        ctx.addIssue({ code: "custom", message: "ADMIN_CHAT_IDS must be comma-separated integers" });
        return z.NEVER;
      }
      return ids;
    }),
  CLIENT_URL: z
    .url({ protocol: /^https$/, error: "CLIENT_URL must be an https:// URL (Telegram only opens Mini Apps over HTTPS)" })
    .transform((url) => url.replace(/\/+$/, "")),
  DATA_DIR: z.string().default("./data"),
  PORT: z.coerce.number().int().positive().default(8000),
});

export interface Config {
  botToken: string;
  adminChatIds: number[];
  clientUrl: string;
  /** Holds afiya.db and uploads/. */
  dataDir: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${problems.join("\n")}\nSee server/.env.example.`);
  }
  const parsed = result.data;
  return {
    botToken: parsed.BOT_TOKEN,
    adminChatIds: parsed.ADMIN_CHAT_IDS,
    clientUrl: parsed.CLIENT_URL,
    dataDir: parsed.DATA_DIR,
    port: parsed.PORT,
  };
}
