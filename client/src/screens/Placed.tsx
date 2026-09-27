import type { Order, ShopInfo } from "../../../shared/types";
import { Button, Money } from "../components/ui";
import { useT } from "../lib/i18n";

export function Placed(props: { order: Order; shop: ShopInfo; onOrders: () => void; onShop: () => void }) {
  const t = useT();
  const pickup = props.order.fulfillment === "pickup";
  return (
    <div className="placed">
      <p className="placed__icon" aria-hidden>✅</p>
      <h2 className="placed__title">{t("Rahmat! Buyurtmangiz qabul qilindi")}</h2>
      <p className="placed__number">
        {t("Buyurtma raqami")}: <strong>№{props.order.id}</strong>
      </p>
      <p className="placed__total">
        {t("Jami")}: <strong><Money amount={props.order.total} /></strong>
      </p>
      <p className="placed__next">
        {t(
          pickup
            ? "Buyurtmangiz tayyor bo'lganda Telegram orqali xabar yuboramiz. Keyin olib ketishingiz mumkin."
            : "Tez orada yetkazib beramiz. Har bir o'zgarish haqida Telegram orqali xabar yuboramiz.",
        )}
      </p>
      {props.shop.phone ? (
        <a className="btn btn--secondary btn--normal btn--wide" href={`tel:${props.shop.phone}`}>
          📞 {t("Savol bo'lsa qo'ng'iroq qiling")}: {props.shop.phone}
        </a>
      ) : null}
      <Button size="large" onClick={props.onOrders}>📦 {t("Buyurtmalarim")}</Button>
      <Button variant="ghost" onClick={props.onShop}>{t("Do'konga qaytish")}</Button>
    </div>
  );
}
