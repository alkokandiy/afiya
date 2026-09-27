import { useState } from "react";
import type { Role } from "../../../../shared/types";
import { Tabs } from "../../components/ui";
import { allowedStaffTabs, type StaffTab } from "../../lib/staff";
import { useT } from "../../lib/i18n";
import { AdminScreen } from "./AdminScreen";
import { DriverScreen } from "./DriverScreen";
import { SellerScreen } from "./SellerScreen";


export function StaffArea(props: { roles: Role[]; meId: number; initial?: StaffTab }) {
  const t = useT();
  const tabs = allowedStaffTabs(props.roles);
  const [tab, setTab] = useState<StaffTab>(props.initial && tabs.includes(props.initial) ? props.initial : tabs[0]!);
  const labels: Record<StaffTab, string> = { seller: "📦 Sotuvchi", driver: "🚚 Haydovchi", admin: "⚙️ Admin" };

  return (
    <>
      {tabs.length > 1 ? <Tabs value={tab} onChange={setTab} options={tabs.map((value) => ({ value, label: t(labels[value]) }))} /> : null}
      {tab === "seller" ? <SellerScreen roles={props.roles} meId={props.meId} /> : null}
      {tab === "driver" ? <DriverScreen roles={props.roles} meId={props.meId} /> : null}
      {tab === "admin" ? <AdminScreen roles={props.roles} meId={props.meId} /> : null}
    </>
  );
}
