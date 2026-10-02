import {
  Briefcase,
  CalendarClock,
  CalendarOff,
  Clock,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/shared/types";

export type NavItem = {
  label: string;
  to: string;
  /** Sheet this mirrors in the company workbook. */
  note: string;
  /** Row icon shown to the left of the label. */
  icon: LucideIcon;
  soon?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Daily Time Record", to: "/records", note: "DTR sheet", icon: Clock },
  { label: "Official Business", to: "/official-business", note: "OB form", icon: Briefcase },
  {
    label: "Change Time Schedule",
    to: "/change-time-schedule",
    note: "Notice form",
    icon: CalendarClock,
    soon: true,
  },
  {
    label: "Change Rest Day",
    to: "/change-rest-day",
    note: "Notice form",
    icon: CalendarOff,
    soon: true,
  },
  { label: "My Account", to: "/profile", note: "Employee details", icon: UserRound },
];

export function roleLabel(role: Role | undefined) {
  return role === "admin" ? "Administrator" : "Staff";
}
