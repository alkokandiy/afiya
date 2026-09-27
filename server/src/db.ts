import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

// Each entry runs once, in order; PRAGMA user_version records how many have run.
const migrations: ((db: DB) => void)[] = [
  (db) => {
    db.exec(`
      CREATE TABLE categories (
        id   INTEGER PRIMARY KEY,
        name TEXT    NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE products (
        id          INTEGER PRIMARY KEY,
        title       TEXT    NOT NULL,
        title_cyr   TEXT    NOT NULL DEFAULT '',     -- optional hand-written Cyrillic name
        price       INTEGER NOT NULL CHECK (price > 0),
        image       TEXT    NOT NULL DEFAULT '',
        category_id INTEGER REFERENCES categories (id) ON DELETE SET NULL,
        stock       INTEGER CHECK (stock >= 0),          -- NULL: not tracked
        active      INTEGER NOT NULL DEFAULT 1,
        sort        INTEGER NOT NULL DEFAULT 0
      );

      -- Everyone who opened the shop (Telegram user id). Staff are users with roles.
      CREATE TABLE users (
        id           INTEGER PRIMARY KEY,
        first_name   TEXT    NOT NULL DEFAULT '',
        username     TEXT,
        name         TEXT    NOT NULL DEFAULT '',
        phone        TEXT    NOT NULL DEFAULT '',
        address      TEXT    NOT NULL DEFAULT '',
        script       TEXT    NOT NULL DEFAULT 'latn',
        roles        TEXT    NOT NULL DEFAULT '',      -- comma-separated
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        last_seen_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE orders (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users (id),
        status       TEXT    NOT NULL DEFAULT 'new',
        fulfillment  TEXT    NOT NULL,
        payment      TEXT    NOT NULL,
        paid         INTEGER NOT NULL DEFAULT 0,
        name         TEXT    NOT NULL,
        phone        TEXT    NOT NULL,
        address      TEXT    NOT NULL DEFAULT '',
        latitude     REAL,
        longitude    REAL,
        note         TEXT    NOT NULL DEFAULT '',
        subtotal     INTEGER NOT NULL,
        delivery_fee INTEGER NOT NULL DEFAULT 0,
        total        INTEGER NOT NULL,
        driver_id    INTEGER REFERENCES users (id),
        created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX orders_user_id ON orders (user_id);
      CREATE INDEX orders_status ON orders (status);

      CREATE TABLE order_items (
        order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL,
        title      TEXT    NOT NULL,
        title_cyr  TEXT    NOT NULL DEFAULT '',
        price      INTEGER NOT NULL,
        quantity   INTEGER NOT NULL
      );
      CREATE INDEX order_items_order_id ON order_items (order_id);

      -- Who moved each order to which status, and when.
      CREATE TABLE order_events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
        status     TEXT    NOT NULL,
        user_id    INTEGER,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const insertCategory = db.prepare("INSERT INTO categories (id, name, sort) VALUES (?, ?, ?)");
    initialCategories.forEach(([id, name], index) => insertCategory.run(id, name, index));

    const insertProduct = db.prepare(
      "INSERT INTO products (id, title, title_cyr, price, image, category_id, sort) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    initialProducts.forEach(([id, title, titleCyr, price, categoryId], index) => {
      insertProduct.run(id, title, titleCyr, price, `/img/products/${id}.webp`, categoryId, index);
    });
  },
  // Cyrillic became the default script. Nobody had picked one yet, so everyone moves over.
  (db) => {
    db.exec("UPDATE users SET script = 'cyrl'");
  },
];

const initialCategories: [id: number, name: string][] = [
  [1, "Kir yuvish"],
  [2, "Idish yuvish"],
  [3, "Sovun"],
  [4, "Tozalash"],
];

// Starting catalog; edit everything afterwards from the Admin screen.
// Brand names don't transliterate well ("Nexx" → "Нехх"), so the Cyrillic names are written by hand.
const initialProducts: [id: number, title: string, titleCyr: string, price: number, categoryId: number][] = [
  [1, "Pushti Nexx (Extra)", "Пушти Некс (Экстра)", 70000, 1],
  [2, "Ko'k Nexx (Extra)", "Кўк Некс (Экстра)", 70000, 1],
  [3, "Ko'k Nexx 5L", "Кўк Некс 5Л", 55000, 1],
  [4, "Nexx Kirsovun 5L", "Некс Кирсовун 5Л", 45000, 1],
  [5, "Nexx Kirsovun", "Некс Кирсовун", 12000, 1],
  [6, "Nexx Kirsovun (Zangor)", "Некс Кирсовун (Зангор)", 12000, 1],
  [7, "Ko'k Nexx 1L", "Кўк Некс 1Л", 15000, 1],
  [8, "Dur 1L", "Дур 1Л", 17000, 3],
  [9, "Dur 2.5L", "Дур 2.5Л", 34000, 3],
  [10, "Idish Gel (Sariq)", "Идиш гел (Сариқ)", 9000, 2],
  [11, "Idish Gel (Qizil)", "Идиш гел (Қизил)", 9000, 2],
  [12, "Idish Gel (Yashil)", "Идиш гел (Яшил)", 9000, 2],
  [13, "Dur Sovun (Shaftoli)", "Дур совун (Шафтоли)", 9000, 3],
  [14, "Sovun Dur (Pushti)", "Совун Дур (Пушти)", 9000, 3],
  [15, "Sovun Dur (Qizil)", "Совун Дур (Қизил)", 9000, 3],
  [16, "Raksha", "Ракша", 8000, 4],
  [17, "Parashok (Avtomat)", "Порошок (Автомат)", 13000, 1],
  [18, "Belizna", "Белизна", 8000, 4],
  [19, "Nexx Gel 2.5L", "Некс гел 2.5Л", 35000, 1],
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
