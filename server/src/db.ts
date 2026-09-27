import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

// Each entry runs once, in order; PRAGMA user_version records how many have run.
const migrations: ((db: DB) => void)[] = [
  (db) => {
    db.exec(`
      CREATE TABLE products (
        id      INTEGER PRIMARY KEY,
        title   TEXT    NOT NULL,
        price   INTEGER NOT NULL CHECK (price > 0),
        image   TEXT    NOT NULL,
        active  INTEGER NOT NULL DEFAULT 1,
        sort    INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE customers (
        chat_id    INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        phone      TEXT NOT NULL,
        address    TEXT,
        latitude   REAL,
        longitude  REAL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE checkout_sessions (
        chat_id    INTEGER PRIMARY KEY,
        step       TEXT NOT NULL,
        items      TEXT NOT NULL,
        draft      TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE orders (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id    INTEGER NOT NULL,
        name       TEXT    NOT NULL,
        phone      TEXT    NOT NULL,
        address    TEXT,
        latitude   REAL,
        longitude  REAL,
        total      INTEGER NOT NULL,
        status     TEXT    NOT NULL DEFAULT 'new',
        created_at TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX orders_chat_id ON orders (chat_id);

      CREATE TABLE order_items (
        order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL,
        title      TEXT    NOT NULL,
        price      INTEGER NOT NULL,
        quantity   INTEGER NOT NULL
      );
      CREATE INDEX order_items_order_id ON order_items (order_id);
    `);

    const insert = db.prepare("INSERT INTO products (id, title, price, image, sort) VALUES (?, ?, ?, ?, ?)");
    initialProducts.forEach(([id, title, price], index) => {
      insert.run(id, title, price, `/img/products/${id}.webp`, index);
    });
  },
];

// The catalog that used to be hardcoded in the client. Edit prices afterwards with the bot's admin commands.
const initialProducts: [id: number, title: string, price: number][] = [
  [1, "Pushti Nexx (Extra)", 70000],
  [2, "Ko'k Nexx (Extra)", 70000],
  [3, "Ko'k Nexx 5L", 55000],
  [4, "Nexx Kirsovun 5L", 45000],
  [5, "Nexx Kirsovun", 12000],
  [6, "Nexx Kirsovun (Zangor)", 12000],
  [7, "Ko'k Nexx 1L", 15000],
  [8, "Dur 1L", 17000],
  [9, "Dur 2.5L", 34000],
  [10, "Idish Gel (Sariq)", 9000],
  [11, "Idish Gel (Qizil)", 9000],
  [12, "Idish Gel (Yashil)", 9000],
  [13, "Dur Sovun (Shaftoli)", 9000],
  [14, "Sovun Dur (Pushti)", 9000],
  [15, "Sovun Dur (Qizil)", 9000],
  [16, "Raksha", 8000],
  [17, "Parashok (Avtomat)", 13000],
  [18, "Belizna", 8000],
  [19, "Nexx Gel 2.5L", 35000],
];

export function openDatabase(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const applied = db.pragma("user_version", { simple: true }) as number;
  for (let version = applied; version < migrations.length; version++) {
    db.transaction(() => {
      migrations[version]!(db);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
  return db;
}
