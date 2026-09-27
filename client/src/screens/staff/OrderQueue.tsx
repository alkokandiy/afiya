import type { Order, Role } from "../../../../shared/types";
import { OrderCard } from "../../components/OrderCard";
import { Button, EmptyState, ErrorState, Loading } from "../../components/ui";
import { useT } from "../../lib/i18n";
import type { AsyncState } from "../../lib/use-async";

export interface QueueSection {
  title: string;
  hint?: string;
  filter: (order: Order) => boolean;
}

/** Orders grouped into work sections, refreshed automatically. */
export function OrderQueue(props: { orders: AsyncState<Order[]>; sections: QueueSection[]; roles: Role[]; meId: number; emptyText: string }) {
  const t = useT();
  const { orders } = props;
  if (orders.error && !orders.data) return <ErrorState message={orders.error} onRetry={orders.reload} />;
  if (!orders.data) return <Loading />;

  const onChanged = () => orders.reload();
  const total = orders.data.length;

  return (
    <>
      <div className="queue-toolbar">
        <Button variant="ghost" wide={false} busy={orders.loading} onClick={orders.reload}>🔄 {t("Yangilash")}</Button>
      </div>
      {total === 0 ? <EmptyState icon="☕" text={t(props.emptyText)} /> : null}
      {props.sections.map((section) => {
        const items = orders.data!.filter(section.filter);
        if (items.length === 0) return null;
        return (
          <section key={section.title} className="queue-section">
            <h2 className="queue-section__title">
              {t(section.title)} <span className="badge">{items.length}</span>
            </h2>
            {section.hint ? <p className="queue-section__hint">{t(section.hint)}</p> : null}
            <div className="stack">
              {items.map((order) => (
                <OrderCard key={order.id} order={order} view="staff" roles={props.roles} meId={props.meId} onChanged={onChanged} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
