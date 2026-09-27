import { InlineKeyboard, type Api } from "grammy";
import { toCyrillic } from "../../shared/translit.js";
import type { Store } from "./store/index.js";

export interface Button {
  text: string;
  /** Screen of the Mini App to open, e.g. "orders" or "seller". */
  screen: string;
}

/** Uzbek Latin HTML, or a function of the recipient's script (to pick hand-written Cyrillic product names). */
export type Message = string | ((cyrillic: boolean) => string);

export interface Notifier {
  /** Converts the message to the recipient's script and sends it. Never throws. */
  send(userId: number, message: Message, button?: Button): Promise<void>;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Convert only the text between tags (and not entities like &amp;), so the markup stays intact.
export const htmlToCyrillic = (html: string) =>
  html.replace(/(<[^>]*>|&[a-z]+;)|([^<&]+)/g, (_m, markup: string | undefined, text: string) => markup ?? toCyrillic(text));

export class TelegramNotifier implements Notifier {
  constructor(
    private readonly api: Api,
    private readonly store: Store,
    private readonly clientUrl: string,
  ) {}

  async send(userId: number, message: Message, button?: Button): Promise<void> {
    const cyrillic = this.store.users.get(userId)?.script === "cyrl";
    const convert = (value: string) => (cyrillic ? htmlToCyrillic(value) : value);
    const text = typeof message === "function" ? message(cyrillic) : message;
    try {
      await this.api.sendMessage(userId, convert(text), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: button
          ? new InlineKeyboard().webApp(convert(button.text), `${this.clientUrl}/?screen=${button.screen}`)
          : undefined,
      });
    } catch (error) {
      // Usually the person never pressed /start or blocked the bot; the order itself is fine.
      console.error(`Could not message ${userId}:`, (error as Error).message);
    }
  }
}
