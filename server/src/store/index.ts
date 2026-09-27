import type { DB } from "../db.js";
import { CatalogStore } from "./catalog.js";
import { OrderStore } from "./orders.js";
import { SettingsStore } from "./settings.js";
import { UserStore } from "./users.js";

export class Store {
  readonly catalog: CatalogStore;
  readonly users: UserStore;
  readonly orders: OrderStore;
  readonly settings: SettingsStore;

  constructor(readonly db: DB) {
    this.catalog = new CatalogStore(db);
    this.users = new UserStore(db);
    this.orders = new OrderStore(db);
    this.settings = new SettingsStore(db);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

export type { User } from "./users.js";
