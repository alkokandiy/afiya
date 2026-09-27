import type { ReactNode } from "react";
import { formatMoney } from "../../../shared/types";
import { useT } from "../lib/i18n";
import { haptic } from "../lib/telegram";

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "large" | "normal";
  disabled?: boolean;
  busy?: boolean;
  type?: "button" | "submit";
  wide?: boolean;
  /** Label on the left, value (e.g. a price) on the right. */
  split?: boolean;
}) {
  const { variant = "primary", size = "normal", wide = true } = props;
  return (
    <button
      type={props.type ?? "button"}
      className={`btn btn--${variant} btn--${size}${wide ? " btn--wide" : ""}${props.split ? " btn--split" : ""}`}
      disabled={props.disabled || props.busy}
      onClick={() => {
        haptic("tap");
        props.onClick?.();
      }}
    >
      {props.busy ? <span className="spinner" aria-hidden /> : null}
      {props.children}
    </button>
  );
}

export function Money({ amount }: { amount: number }) {
  const t = useT();
  return <span className="money">{t(formatMoney(amount))}</span>;
}

export function Stepper(props: { value: number; max: number; onChange: (value: number) => void; label: string }) {
  const t = useT();
  return (
    <div className="stepper" role="group" aria-label={props.label}>
      <button type="button" className="stepper__btn" aria-label={t("Kamaytirish")} onClick={() => { haptic("tap"); props.onChange(props.value - 1); }}>
        −
      </button>
      <span className="stepper__value" aria-live="polite">{props.value}</span>
      <button
        type="button"
        className="stepper__btn"
        aria-label={t("Ko'paytirish")}
        disabled={props.value >= props.max}
        onClick={() => { haptic("tap"); props.onChange(props.value + 1); }}
      >
        +
      </button>
    </div>
  );
}

export function ChoiceCard(props: { selected: boolean; onSelect: () => void; icon: string; title: string; subtitle?: ReactNode }) {
  return (
    <button
      type="button"
      className={`choice${props.selected ? " choice--selected" : ""}`}
      aria-pressed={props.selected}
      onClick={() => { haptic("tap"); props.onSelect(); }}
    >
      <span className="choice__icon" aria-hidden>{props.icon}</span>
      <span className="choice__text">
        <span className="choice__title">{props.title}</span>
        {props.subtitle ? <span className="choice__subtitle">{props.subtitle}</span> : null}
      </span>
      <span className="choice__check" aria-hidden>{props.selected ? "✓" : ""}</span>
    </button>
  );
}

export function Loading() {
  const t = useT();
  return (
    <div className="state">
      <span className="spinner spinner--big" aria-hidden />
      <p>{t("Yuklanmoqda…")}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="state">
      <p className="state__icon" aria-hidden>⚠️</p>
      <p>{t(message)}</p>
      <Button onClick={onRetry} variant="secondary" wide={false}>{t("Qayta urinish")}</Button>
    </div>
  );
}

export function EmptyState(props: { icon: string; text: string; action?: ReactNode }) {
  return (
    <div className="state">
      <p className="state__icon" aria-hidden>{props.icon}</p>
      <p>{props.text}</p>
      {props.action}
    </div>
  );
}

export function ProductImage({ src, alt }: { src: string; alt: string }) {
  return src ? <img className="product-image" src={src} alt={alt} loading="lazy" /> : <div className="product-image product-image--empty" aria-hidden>🧴</div>;
}

export function Field(props: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{props.label}</span>
      {props.children}
      {props.error ? <span className="field__error">{props.error}</span> : props.hint ? <span className="field__hint">{props.hint}</span> : null}
    </label>
  );
}

export function Tabs<T extends string>(props: { value: T; options: { value: T; label: string; badge?: number }[]; onChange: (value: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {props.options.map((option) => (
        <button
          key={option.value}
          role="tab"
          type="button"
          aria-selected={props.value === option.value}
          className={`tabs__tab${props.value === option.value ? " tabs__tab--active" : ""}`}
          onClick={() => { haptic("tap"); props.onChange(option.value); }}
        >
          {option.label}
          {option.badge ? <span className="badge">{option.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
