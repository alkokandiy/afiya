import type { Role } from "../../../../shared/types";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/use-async";
import { OrderQueue } from "./OrderQueue";

export function SellerScreen(props: { roles: Role[]; meId: number }) {
  const orders = useAsync(() => api.staffOrders(["new", "ready"]), { refreshMs: 20_000 });
  return (
    <OrderQueue
      orders={orders}
      roles={props.roles}
      meId={props.meId}
      emptyText="Hozircha yangi buyurtma yo'q"
      sections={[
        { title: "📦 Yig'ish kerak", hint: "Mahsulotlarni yig'ing, keyin «Yig'ildi, tayyor» ni bosing.", filter: (o) => o.status === "new" },
        {
          title: "🏠 Olib ketishni kutmoqda",
          hint: "Mijoz kelganda mahsulot va pulni topshirib, tugmani bosing.",
          filter: (o) => o.status === "ready" && o.fulfillment === "pickup",
        },
        { title: "🚚 Haydovchini kutmoqda", filter: (o) => o.status === "ready" && o.fulfillment === "delivery" },
      ]}
    />
  );
}
