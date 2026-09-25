import type { Role } from "@/shared/types";

export type NavItem = {
  label: string;
  to: string;
  /** Sheet this mirrors in the company workbook. */
  note: string;
  adminOnly?: boolean;
  soon?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Daily Time Record", to: "/records", note: "DTR sheet" },
  { label: "Change Time Schedule", to: "/change-time-schedule", note: "Notice form", soon: true },
  { label: "Change Rest Day", to: "/change-rest-day", note: "Notice form", soon: true },
  { label: "Template & Access", to: "/admin", note: "Administrator only", adminOnly: true },
  { label: "My Account", to: "/profile", note: "Employee details" },
];

export function visibleNavItems(role: Role | undefined) {
  return NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");
}

export function roleLabel(role: Role | undefined) {
  return role === "admin" ? "Administrator" : "Staff";
}
