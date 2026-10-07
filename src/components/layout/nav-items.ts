import {
  Briefcase,
  CalendarClock,
  CalendarX,
  Clock,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/shared/types";

export type NavItem = {
  label: string;
  to: string;
  /** Row icon shown to the left of the label. */
  icon: LucideIcon;
  /** Renders as an inert row with a "Soon" pill instead of a link. */
  soon?: boolean;
};

export type NavSection = {
  /** Uppercased group heading shown above the section's rows. */
  label: string;
  items: NavItem[];
};

/** The sidebar's nav, grouped exactly as the portal mock lays it out. */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Records & Forms",
    items: [
      { label: "Daily Time Record", to: "/records", icon: Clock },
      { label: "Official Business", to: "/official-business", icon: Briefcase },
      { label: "Leave of Absence", to: "/leave-of-absence", icon: CalendarX },
      { label: "Change of Schedule", to: "/change-of-schedule", icon: CalendarClock },
      { label: "Overtime", to: "/overtime", icon: Clock },
    ],
  },
  {
    label: "Account",
    items: [{ label: "My Account", to: "/profile", icon: UserRound }],
  },
];

export function roleLabel(role: Role | undefined) {
  return role === "admin" ? "Administrator" : "Staff";
}
