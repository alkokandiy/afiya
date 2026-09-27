import type { Role } from "../../../../shared/types";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/use-async";
import { OrderQueue } from "./OrderQueue";

export function DriverScreen(props: { roles: Role[]; meId: number }) {
  const orders = useAsync(() => api.staffOrders(["ready", "delivering"], "delivery"), { refreshMs: 20_000 });
  return (
    <OrderQueue
      orders={orders}
      roles={props.roles}
      meId={props.meId}
      emptyText="Hozircha yetkaziladigan buyurtma yo'q"
      sections={[
        { title: "🚚 Yo'lda", hint: "Topshirib, pulni olgach tugmani bosing.", filter: (o) => o.status === "delivering" },
        { title: "📦 Olib ketish kerak", hint: "Yo'lga chiqishda «Olib ketdim» ni bosing — mijozga xabar boradi.", filter: (o) => o.status === "ready" },
      ]}
    />
  );
}
