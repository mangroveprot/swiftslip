import type { Role } from "@/shared/types";

export type NavItem = {
  label: string;
  to: string;
  /** Sheet this mirrors in the company workbook. */
  note: string;
  soon?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Daily Time Record", to: "/records", note: "DTR sheet" },
  { label: "Official Business", to: "/official-business", note: "OB form" },
  { label: "Change Time Schedule", to: "/change-time-schedule", note: "Notice form", soon: true },
  { label: "Change Rest Day", to: "/change-rest-day", note: "Notice form", soon: true },
  { label: "My Account", to: "/profile", note: "Employee details" },
];

export function roleLabel(role: Role | undefined) {
  return role === "admin" ? "Administrator" : "Staff";
}
