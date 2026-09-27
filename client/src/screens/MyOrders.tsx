import type { Order, ShopInfo } from "../../../shared/types";
import { OrderCard } from "../components/OrderCard";
import { Button, EmptyState, ErrorState, Loading } from "../components/ui";
import { api } from "../lib/api";
import { useT } from "../lib/i18n";
import { inTelegram } from "../lib/telegram";
import { useAsync } from "../lib/use-async";

export function MyOrders(props: { meId: number; shop: ShopInfo; onReorder: (order: Order) => void; onShop: () => void }) {
  const t = useT();
  const orders = useAsync(() => (inTelegram ? api.myOrders() : Promise.resolve([])), { refreshMs: 30_000 });

  if (!inTelegram) return <EmptyState icon="📱" text={t("Buyurtmalaringizni ko'rish uchun do'konni Telegram orqali oching.")} />;
  if (orders.error && !orders.data) return <ErrorState message={orders.error} onRetry={orders.reload} />;
  if (!orders.data) return <Loading />;
  if (orders.data.length === 0) {
    return (
      <EmptyState
        icon="📦"
        text={t("Hali buyurtma bermagansiz")}
        action={<Button onClick={props.onShop} wide={false}>{t("Mahsulotlarni ko'rish")}</Button>}
      />
    );
  }

  const replace = (updated: Order) => orders.setData(orders.data!.map((o) => (o.id === updated.id ? updated : o)));

  return (
    <>
      <h2 className="screen-title">{t("Buyurtmalarim")}</h2>
      {props.shop.phone ? (
        <a className="call-strip" href={`tel:${props.shop.phone}`}>
          📞 {t("Savol bo'lsa qo'ng'iroq qiling")}: <strong>{props.shop.phone}</strong>
        </a>
      ) : null}
      <div className="stack">
        {orders.data.map((order) => (
          <OrderCard key={order.id} order={order} view="customer" roles={[]} meId={props.meId} onChanged={replace} onReorder={props.onReorder} />
        ))}
      </div>
    </>
  );
}
