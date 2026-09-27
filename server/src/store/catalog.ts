import type { AdminProduct, Category } from "../../../shared/types.js";
import type { DB } from "../db.js";

interface ProductRow {
  id: number;
  title: string;
  title_cyr: string;
  price: number;
  image: string;
  category_id: number | null;
  stock: number | null;
  active: number;
}

const toProduct = (row: ProductRow): AdminProduct => ({
  id: row.id,
  title: row.title,
  titleCyr: row.title_cyr,
  price: row.price,
  image: row.image,
  categoryId: row.category_id,
  stock: row.stock,
  active: row.active === 1,
});

export interface ProductInput {
  title: string;
  titleCyr: string;
  price: number;
  categoryId: number | null;
  stock: number | null;
  active: boolean;
}

export class CatalogStore {
  constructor(private readonly db: DB) {}

  listProducts({ includeInactive = false } = {}): AdminProduct[] {
    const rows = this.db
      .prepare(`SELECT * FROM products ${includeInactive ? "" : "WHERE active = 1"} ORDER BY sort, id`)
      .all() as ProductRow[];
    return rows.map(toProduct);
  }

  getProduct(id: number): AdminProduct | undefined {
    const row = this.db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
    return row && toProduct(row);
  }

  createProduct(input: ProductInput): AdminProduct {
    const sort = (this.db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM products").get() as { next: number }).next;
    const id = this.db
      .prepare("INSERT INTO products (title, title_cyr, price, category_id, stock, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(input.title, input.titleCyr, input.price, input.categoryId, input.stock, input.active ? 1 : 0, sort).lastInsertRowid;
    return this.getProduct(Number(id))!;
  }

  updateProduct(id: number, input: Partial<ProductInput>): AdminProduct | undefined {
    const current = this.getProduct(id);
    if (!current) return undefined;
    const next = { ...current, ...input };
    this.db
      .prepare("UPDATE products SET title = ?, title_cyr = ?, price = ?, category_id = ?, stock = ?, active = ? WHERE id = ?")
      .run(next.title, next.titleCyr, next.price, next.categoryId, next.stock, next.active ? 1 : 0, id);
    return this.getProduct(id);
  }

  setImage(id: number, image: string): void {
    this.db.prepare("UPDATE products SET image = ? WHERE id = ?").run(image, id);
  }

  /** Returns false if there isn't enough; the caller must run this inside a transaction. */
  takeStock(id: number, quantity: number): boolean {
    const result = this.db
      .prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND (stock IS NULL OR stock >= ?)")
      .run(quantity, id, quantity);
    return result.changes > 0;
  }

  returnStock(id: number, quantity: number): void {
    this.db.prepare("UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL").run(quantity, id);
  }

  listCategories(): Category[] {
    return this.db.prepare("SELECT id, name FROM categories ORDER BY sort, id").all() as Category[];
  }

  createCategory(name: string): Category {
    const sort = (this.db.prepare("SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM categories").get() as { next: number }).next;
    const id = Number(this.db.prepare("INSERT INTO categories (name, sort) VALUES (?, ?)").run(name, sort).lastInsertRowid);
    return { id, name };
  }

  renameCategory(id: number, name: string): boolean {
    return this.db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, id).changes > 0;
  }

  deleteCategory(id: number): boolean {
    return this.db.prepare("DELETE FROM categories WHERE id = ?").run(id).changes > 0;
  }
}
