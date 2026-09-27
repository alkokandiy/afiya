import { useState } from "react";
import type { Role } from "../../../../shared/types";
import { Tabs } from "../../components/ui";
import { useT } from "../../lib/i18n";
import { AllOrders } from "./admin/AllOrders";
import { Products } from "./admin/Products";
import { SettingsForm } from "./admin/SettingsForm";
import { StaffList } from "./admin/StaffList";
import { StatsView } from "./admin/StatsView";

type Section = "stats" | "products" | "orders" | "staff" | "settings";

export function AdminScreen(props: { roles: Role[]; meId: number }) {
  const t = useT();
  const [section, setSection] = useState<Section>("stats");
  const labels: Record<Section, string> = {
    stats: "Hisobot",
    products: "Mahsulotlar",
    orders: "Buyurtmalar",
    staff: "Xodimlar",
    settings: "Sozlamalar",
  };
  return (
    <>
      <Tabs
        value={section}
        onChange={setSection}
        options={(Object.keys(labels) as Section[]).map((value) => ({ value, label: t(labels[value]) }))}
      />
      {section === "stats" ? <StatsView /> : null}
      {section === "products" ? <Products /> : null}
      {section === "orders" ? <AllOrders roles={props.roles} meId={props.meId} /> : null}
      {section === "staff" ? <StaffList /> : null}
      {section === "settings" ? <SettingsForm /> : null}
    </>
  );
}
