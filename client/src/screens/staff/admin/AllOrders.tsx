import { useState } from "react";
import type { OrderStatus, Role } from "../../../../../shared/types";
import { OrderCard } from "../../../components/OrderCard";
import { EmptyState, ErrorState, Loading, Tabs } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import { useAsync } from "../../../lib/use-async";

const FILTERS: Record<"open" | "completed" | "cancelled", OrderStatus[]> = {
  open: ["new", "ready", "delivering"],
  completed: ["completed"],
  cancelled: ["cancelled"],
};

function OrderList(props: { statuses: OrderStatus[]; roles: Role[]; meId: number }) {
  const t = useT();
  const orders = useAsync(() => api.staffOrders(props.statuses), { refreshMs: 30_000 });
  if (orders.error && !orders.data) return <ErrorState message={orders.error} onRetry={orders.reload} />;
  if (!orders.data) return <Loading />;
  if (orders.data.length === 0) return <EmptyState icon="📭" text={t("Buyurtma yo'q")} />;
  return (
    <div className="stack">
      {orders.data.map((order) => (
        <OrderCard key={order.id} order={order} view="staff" roles={props.roles} meId={props.meId} onChanged={orders.reload} />
      ))}
    </div>
  );
}

export function AllOrders(props: { roles: Role[]; meId: number }) {
  const t = useT();
  const [filter, setFilter] = useState<keyof typeof FILTERS>("open");
  return (
    <>
      <Tabs
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: t("Faol") },
          { value: "completed", label: t("Topshirilgan") },
          { value: "cancelled", label: t("Bekor qilingan") },
        ]}
      />
      <OrderList key={filter} statuses={FILTERS[filter]} roles={props.roles} meId={props.meId} />
    </>
  );
}
