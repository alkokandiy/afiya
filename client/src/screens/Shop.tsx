import { useMemo, useState } from "react";
import { searchKey } from "../../../shared/translit";
import type { Catalog, Product } from "../../../shared/types";
import { Button, EmptyState, Money, ProductImage, Stepper } from "../components/ui";
import { quantityOf, type Cart } from "../lib/cart";
import { useT, useTitle } from "../lib/i18n";

export function Shop(props: {
  catalog: Catalog;
  cart: Cart;
  cartCount: number;
  cartTotal: number;
  onQuantity: (product: Product, quantity: number) => void;
  onOpenCart: () => void;
}) {
  const t = useT();
  const title = useTitle();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const products = useMemo(() => {
    const key = searchKey(query);
    return props.catalog.products.filter(
      (p) => (key ? searchKey(`${p.title} ${p.titleCyr}`).includes(key) : categoryId === null || p.categoryId === categoryId),
    );
  }, [props.catalog.products, query, categoryId]);

  const categories = props.catalog.categories.filter((c) => props.catalog.products.some((p) => p.categoryId === c.id));

  return (
    <>
      <div className="search">
        <span className="search__icon" aria-hidden>🔍</span>
        <input
          className="search__input"
          type="search"
          inputMode="search"
          placeholder={t("Mahsulot qidirish")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("Mahsulot qidirish")}
        />
        {query ? (
          <button type="button" className="search__clear" onClick={() => setQuery("")} aria-label={t("Tozalash")}>
            ✕
          </button>
        ) : null}
      </div>

      {!query ? (
        <div className="chips" role="tablist" aria-label={t("Bo'limlar")}>
          {[{ id: null as number | null, name: "Hammasi" }, ...categories].map((c) => (
            <button
              key={c.id ?? "all"}
              type="button"
              role="tab"
              aria-selected={categoryId === c.id}
              className={`chip${categoryId === c.id ? " chip--active" : ""}`}
              onClick={() => setCategoryId(c.id)}
            >
              {t(c.name)}
            </button>
          ))}
        </div>
      ) : null}

      {products.length === 0 ? (
        <EmptyState icon="🔍" text={t("Hech narsa topilmadi")} />
      ) : (
        <div className="grid">
          {products.map((product) => {
            const quantity = quantityOf(props.cart, product.id);
            const soldOut = product.stock === 0;
            return (
              <div key={product.id} className={`card product${soldOut ? " product--soldout" : ""}`}>
                <ProductImage src={product.image} alt={title(product)} />
                <h3 className="product__title">{title(product)}</h3>
                <p className="product__price">
                  <Money amount={product.price} />
                </p>
                {soldOut ? (
                  <p className="product__soldout">{t("Tugagan")}</p>
                ) : quantity === 0 ? (
                  <Button onClick={() => props.onQuantity(product, 1)}>{t("Savatga")}</Button>
                ) : (
                  <Stepper
                    value={quantity}
                    max={product.stock ?? 99}
                    label={title(product)}
                    onChange={(value) => props.onQuantity(product, value)}
                  />
                )}
                {product.stock !== null && product.stock > 0 && product.stock <= 5 ? (
                  <p className="product__few">{t(`Faqat ${product.stock} dona qoldi`)}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {props.cartCount > 0 ? (
        <div className="action-bar">
          <Button size="large" split onClick={props.onOpenCart}>
            <span>🛒 {t("Savatga o'tish")} ({props.cartCount})</span>
            <Money amount={props.cartTotal} />
          </Button>
        </div>
      ) : null}
    </>
  );
}
