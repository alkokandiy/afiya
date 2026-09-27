import { useState } from "react";
import { ROLE_LABELS, ROLES, type Role, type StaffUser } from "../../../../../shared/types";
import { ErrorState, Loading } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useT } from "../../../lib/i18n";
import { haptic, showAlert } from "../../../lib/telegram";
import { useAsync } from "../../../lib/use-async";

export function StaffList() {
  const t = useT();
  const people = useAsync(api.admin.staff);
  const [saving, setSaving] = useState<number | null>(null);

  if (people.error && !people.data) return <ErrorState message={people.error} onRetry={people.reload} />;
  if (!people.data) return <Loading />;

  const toggle = async (person: StaffUser, role: Role) => {
    const roles = person.roles.includes(role) ? person.roles.filter((r) => r !== role) : [...person.roles, role];
    setSaving(person.id);
    try {
      await api.admin.setRoles(person.id, roles);
      people.setData(people.data!.map((p) => (p.id === person.id ? { ...p, roles } : p)));
      haptic("success");
    } catch (error) {
      await showAlert(t((error as Error).message));
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <p className="notice">
        {t("Yangi xodim qo'shish: u botga /start yozsin yoki do'konni bir marta ochsin. Keyin shu ro'yxatda chiqadi — kerakli vazifani belgilang.")}
      </p>
      <div className="stack">
        {people.data.map((person) => (
          <div key={person.id} className="card person">
            <p className="person__name">
              {person.displayName}
              {person.username ? <span className="muted"> @{person.username}</span> : null}
              {person.owner ? <span className="badge badge--muted">{t("Egasi")}</span> : null}
            </p>
            {person.phone ? <a href={`tel:${person.phone}`} className="muted">{person.phone}</a> : null}
            <div className="role-toggles">
              {ROLES.map((role) => (
                <label key={role} className="checkbox">
                  <input
                    type="checkbox"
                    checked={person.roles.includes(role)}
                    disabled={saving === person.id || (person.owner && role === "admin")}
                    onChange={() => toggle(person, role)}
                  />
                  {t(ROLE_LABELS[role])}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
