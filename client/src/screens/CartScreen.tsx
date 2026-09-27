import type { Product } from "../../../shared/types";
import { Button, EmptyState, Money, ProductImage, Stepper } from "../components/ui";
import type { CartLine } from "../lib/cart";
import { useT, useTitle } from "../lib/i18n";

export function CartScreen(props: {
  lines: CartLine[];
  total: number;
  onQuantity: (product: Product, quantity: number) => void;
  onCheckout: () => void;
  onShop: () => void;
}) {
  const t = useT();
  const title = useTitle();
  if (props.lines.length === 0) {
    return (
      <EmptyState
        icon="🛒"
        text={t("Savatingiz bo'sh")}
        action={<Button onClick={props.onShop} wide={false}>{t("Mahsulotlarni ko'rish")}</Button>}
      />
    );
  }

  return (
    <>
      <h2 className="screen-title">{t("Savatingiz")}</h2>
      <ul className="cart-list">
        {props.lines.map(({ product, quantity }) => (
          <li key={product.id} className="card cart-line">
            <ProductImage src={product.image} alt="" />
            <div className="cart-line__body">
              <p className="cart-line__title">{title(product)}</p>
              <p className="cart-line__price">
                <Money amount={product.price} /> × {quantity} = <strong><Money amount={product.price * quantity} /></strong>
              </p>
              <div className="cart-line__controls">
                <Stepper value={quantity} max={product.stock ?? 99} label={title(product)} onChange={(v) => props.onQuantity(product, v)} />
                <button type="button" className="link-button" onClick={() => props.onQuantity(product, 0)}>
                  🗑 {t("Olib tashlash")}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="cart-total">
        {t("Jami")}: <strong><Money amount={props.total} /></strong>
      </p>
      <div className="action-bar">
        <Button size="large" onClick={props.onCheckout}>
          {t("Buyurtma berish")} ›
        </Button>
      </div>
    </>
  );
}
