import type { Settings } from "../../../shared/types.js";
import type { DB } from "../db.js";

export const DEFAULT_SETTINGS: Settings = {
  phone: "",
  pickupAddress: "",
  pickupHours: "9:00 – 20:00",
  deliveryFee: 0,
  lowStockThreshold: 5,
};

export class SettingsStore {
  constructor(private readonly db: DB) {}

  get(): Settings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
    const stored = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  update(changes: Partial<Settings>): Settings {
    const upsert = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    );
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(changes)) {
        if (key in DEFAULT_SETTINGS && value !== undefined) upsert.run(key, JSON.stringify(value));
      }
    })();
    return this.get();
  }
}
