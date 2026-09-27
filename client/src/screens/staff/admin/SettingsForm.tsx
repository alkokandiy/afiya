import { useState } from "react";
import type { Settings } from "../../../../../shared/types";
import { Button, ErrorState, Field, Loading } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import { haptic, showAlert } from "../../../lib/telegram";
import { useAsync } from "../../../lib/use-async";

function Form({ initial, onSaved }: { initial: Settings; onSaved: (s: Settings) => void }) {
  const t = useT();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await api.admin.updateSettings(form));
      haptic("success");
      await showAlert(t("Saqlandi"));
    } catch (error) {
      await showAlert(t((error as Error).message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      <Field label={t("Do'kon telefoni")} hint={t("Mijozlar shu raqamga qo'ng'iroq qiladi")}>
        <input className="input" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label={t("Olib ketish manzili")} hint={t("«O'zim olib ketaman» tanlaganlarga ko'rsatiladi")}>
        <textarea className="input" rows={2} value={form.pickupAddress} onChange={(e) => set("pickupAddress", e.target.value)} />
      </Field>
      <Field label={t("Ish vaqti")}>
        <input className="input" value={form.pickupHours} onChange={(e) => set("pickupHours", e.target.value)} />
      </Field>
      <Field label={t("Yetkazish narxi (so'm)")} hint={t("0 — bepul")}>
        <input className="input" type="number" inputMode="numeric" min={0} value={form.deliveryFee} onChange={(e) => set("deliveryFee", Math.max(0, Number(e.target.value) || 0))} />
      </Field>
      <Field label={t("Kam qoldi ogohlantirishi (dona)")} hint={t("Qoldiq shundan kam bo'lsa, Telegramga xabar keladi")}>
        <input className="input" type="number" inputMode="numeric" min={0} value={form.lowStockThreshold} onChange={(e) => set("lowStockThreshold", Math.max(0, Number(e.target.value) || 0))} />
      </Field>
      <Button size="large" busy={saving} onClick={save}>{t("Saqlash")}</Button>
    </div>
  );
}

export function SettingsForm() {
  const settings = useAsync(api.admin.settings);
  if (settings.error && !settings.data) return <ErrorState message={settings.error} onRetry={settings.reload} />;
  if (!settings.data) return <Loading />;
  return <Form initial={settings.data} onSaved={settings.setData} />;
}
