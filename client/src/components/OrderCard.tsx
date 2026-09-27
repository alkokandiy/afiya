import { useState } from "react";
import {
  availableTransitions,
  mapsUrl,
  PAYMENT_LABELS,
  STATUS_LABELS,
  type Order,
  type OrderStatus,
  type Role,
} from "../../../shared/types";
import { api } from "../lib/api";
import { useT, useTitle } from "../lib/i18n";
import { confirmAction, haptic, openLink, showAlert } from "../lib/telegram";
import { formatTime } from "../lib/format";
import { Button, Money } from "./ui";

const STEPS: Record<Order["fulfillment"], OrderStatus[]> = {
  pickup: ["new", "ready", "completed"],
  delivery: ["new", "ready", "delivering", "completed"],
};

function Progress({ order }: { order: Order }) {
  const t = useT();
  if (order.status === "cancelled") return <p className="status-pill status-pill--cancelled">❌ {t(STATUS_LABELS.cancelled)}</p>;
  const steps = STEPS[order.fulfillment];
  const current = steps.indexOf(order.status);
  return (
    <ol className="progress">
      {steps.map((step, index) => (
        <li key={step} className={index <= current ? "progress__step progress__step--done" : "progress__step"}>
          <span className="progress__dot" aria-hidden>{index < current || order.status === "completed" ? "✓" : index + 1}</span>
          <span className="progress__label">{t(STATUS_LABELS[step])}</span>
        </li>
      ))}
    </ol>
  );
}

// Asking before these avoids a costly mis-tap.
const CONFIRM: Partial<Record<OrderStatus, string>> = {
  cancelled: "Buyurtmani bekor qilasizmi?",
  completed: "Buyurtma topshirildi va pul olindimi?",
};

export function OrderCard(props: {
  order: Order;
  view: "customer" | "staff";
  roles: Role[];
  meId: number;
  onChanged: (order: Order) => void;
  onReorder?: (order: Order) => void;
}) {
  const { order, view } = props;
  const t = useT();
  const title = useTitle();
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const actions = availableTransitions(order, { roles: view === "staff" ? props.roles : [], isOwner: order.userId === props.meId });

  const act = async (to: OrderStatus) => {
    const question = CONFIRM[to];
    if (question && !(await confirmAction(t(question)))) return;
    setBusy(to);
    try {
      props.onChanged(await api.setStatus(order.id, to));
      haptic("success");
    } catch (error) {
      haptic("error");
      await showAlert(t((error as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const pickup = order.fulfillment === "pickup";
  const hasPlace = !!order.address || order.latitude !== null;

  return (
    <article className={`card order order--${order.status}`}>
      <header className="order__head">
        <h3 className="order__number">
          {t("Buyurtma")} №{order.id}
        </h3>
        <span className="order__time">{formatTime(order.createdAt, t)}</span>
      </header>

      {view === "customer" ? (
        <Progress order={order} />
      ) : (
        <p className={`fulfillment fulfillment--${order.fulfillment}`}>{pickup ? `🏠 ${t("O'zi olib ketadi")}` : `🚚 ${t("Yetkazib berish")}`}</p>
      )}

      {view === "staff" ? (
        <div className="order__customer">
          <p className="order__name">👤 {order.name}</p>
          <a className="order__phone" href={`tel:${order.phone}`}>📞 {order.phone}</a>
          {!pickup && hasPlace ? (
            <button type="button" className="order__address" onClick={() => openLink(mapsUrl(order))}>
              📍 {order.address || t("Joylashuv (xaritada)")} <span className="order__map">{t("Xarita")} ›</span>
            </button>
          ) : null}
          {order.driverName && order.status === "delivering" ? <p>🚚 {order.driverName}</p> : null}
        </div>
      ) : null}

      <ul className="order__lines">
        {order.lines.map((line) => (
          <li key={line.productId}>
            <span className="order__qty">{line.quantity} ×</span>
            <span className="order__title">{title(line)}</span>
            {view === "customer" ? <Money amount={line.price * line.quantity} /> : null}
          </li>
        ))}
      </ul>

      {order.note ? <p className="order__note">💬 {order.note}</p> : null}

      <div className="order__total">
        {order.deliveryFee > 0 ? (
          <span className="order__fee">
            {t("Yetkazish")}: <Money amount={order.deliveryFee} />
          </span>
        ) : null}
        <span>
          {t("Jami")}: <strong><Money amount={order.total} /></strong>
        </span>
        <span className="order__payment">
          {t(PAYMENT_LABELS[order.payment])}
          {order.paid ? ` · ✅ ${t("To'langan")}` : view === "staff" && order.status !== "cancelled" ? ` · ${t("To'lanmagan")}` : ""}
        </span>
      </div>

      {view === "customer" && pickup && order.status === "ready" ? (
        <p className="order__hint">✅ {t("Tayyor! Olib ketishingiz mumkin.")}</p>
      ) : null}

      <div className="order__actions">
        {actions
          .filter((a) => a.to !== "cancelled")
          .map((a) => (
            <Button key={a.to} size="large" busy={busy === a.to} disabled={!!busy} onClick={() => act(a.to)}>
              {t(a.action)}
            </Button>
          ))}
        {view === "customer" && props.onReorder && order.status !== "new" ? (
          <Button variant="secondary" onClick={() => props.onReorder!(order)}>
            🔁 {t("Yana shu buyurtmani berish")}
          </Button>
        ) : null}
        {actions.some((a) => a.to === "cancelled") ? (
          <Button variant="ghost" busy={busy === "cancelled"} disabled={!!busy} onClick={() => act("cancelled")}>
            {t("Bekor qilish")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
