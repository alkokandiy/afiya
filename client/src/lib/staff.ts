import type { Role } from "../../../shared/types";

export type StaffTab = "seller" | "driver" | "admin";

/** Staff screens a person may open; admins see all of them. */
export function allowedStaffTabs(roles: Role[]): StaffTab[] {
  const admin = roles.includes("admin");
  return (["seller", "driver", "admin"] as const).filter((tab) => admin || roles.includes(tab));
}
