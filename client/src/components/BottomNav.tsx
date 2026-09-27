import { useT } from "../lib/i18n";
import { haptic } from "../lib/telegram";

export type Tab = "shop" | "cart" | "orders" | "staff";

export function BottomNav(props: { active: Tab; cartCount: number; showStaff: boolean; onChange: (tab: Tab) => void }) {
  const t = useT();
  const items: { tab: Tab; icon: string; label: string; badge?: number }[] = [
    { tab: "shop", icon: "🏪", label: "Do'kon" },
    { tab: "cart", icon: "🛒", label: "Savat", badge: props.cartCount },
    { tab: "orders", icon: "📦", label: "Buyurtmalar" },
  ];
  if (props.showStaff) items.push({ tab: "staff", icon: "🧑‍💼", label: "Ish joyi" });

  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <button
          key={item.tab}
          type="button"
          className={`bottom-nav__item${props.active === item.tab ? " bottom-nav__item--active" : ""}`}
          aria-current={props.active === item.tab ? "page" : undefined}
          onClick={() => { haptic("tap"); props.onChange(item.tab); }}
        >
          <span className="bottom-nav__icon" aria-hidden>
            {item.icon}
            {item.badge ? <span className="badge badge--float">{item.badge}</span> : null}
          </span>
          <span className="bottom-nav__label">{t(item.label)}</span>
        </button>
      ))}
    </nav>
  );
}
