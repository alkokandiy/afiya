import { useScript, useT } from "../lib/i18n";
import { haptic } from "../lib/telegram";

export function Header() {
  const { script, setScript } = useScript();
  const t = useT();
  return (
    <header className="header">
      <img className="header__logo" src="/img/logo.webp" alt="" />
      <span className="header__title">Afiya Market</span>
      <div className="script-switch" role="group" aria-label={t("Yozuv")}>
        {(["cyrl", "latn"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={script === value}
            className={script === value ? "script-switch__active" : ""}
            onClick={() => { haptic("tap"); setScript(value); }}
          >
            {value === "latn" ? "Lotin" : "Кирилл"}
          </button>
        ))}
      </div>
    </header>
  );
}
