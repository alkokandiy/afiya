import { ErrorState, Loading, Money } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useT, useTitle } from "../../../lib/i18n";
import { useAsync } from "../../../lib/use-async";

export function StatsView() {
  const t = useT();
  const title = useTitle();
  const stats = useAsync(api.admin.stats, { refreshMs: 60_000 });
  if (stats.error && !stats.data) return <ErrorState message={stats.error} onRetry={stats.reload} />;
  if (!stats.data) return <Loading />;
  const s = stats.data;

  return (
    <div className="stack">
      <div className="tiles">
        <div className="tile">
          <span className="tile__label">{t("Bugun")}</span>
          <span className="tile__value">{s.today.orders} {t("ta buyurtma")}</span>
          <span className="tile__sub"><Money amount={s.today.revenue} /> {t("olindi")}</span>
        </div>
        <div className="tile">
          <span className="tile__label">{t("Oxirgi 7 kun")}</span>
          <span className="tile__value">{s.week.orders} {t("ta buyurtma")}</span>
          <span className="tile__sub"><Money amount={s.week.revenue} /> {t("olindi")}</span>
        </div>
      </div>

      <div className="card">
        <h3 className="card__title">{t("Hozir ishda")}</h3>
        <ul className="plain-list">
          <li>📦 {t("Yig'ish kerak")}: <strong>{s.open.new}</strong></li>
          <li>✅ {t("Tayyor, kutmoqda")}: <strong>{s.open.ready}</strong></li>
          <li>🚚 {t("Yo'lda")}: <strong>{s.open.delivering}</strong></li>
        </ul>
      </div>

      <div className="card">
        <h3 className="card__title">⚠️ {t("Kam qolgan mahsulotlar")}</h3>
        {s.lowStock.length === 0 ? (
          <p className="muted">{t("Hammasi yetarli")}</p>
        ) : (
          <ul className="plain-list">
            {s.lowStock.map((p) => (
              <li key={p.id}>
                {title(p)}: <strong className={p.stock === 0 ? "text-danger" : ""}>{p.stock === 0 ? t("tugagan") : `${p.stock} ${t("dona")}`}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="card__title">🏆 {t("Eng ko'p sotilgan (30 kun)")}</h3>
        {s.topProducts.length === 0 ? (
          <p className="muted">{t("Hali sotuv yo'q")}</p>
        ) : (
          <ol className="plain-list">
            {s.topProducts.map((p) => (
              <li key={p.title}>{title(p)} — <strong>{p.quantity} {t("dona")}</strong></li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
