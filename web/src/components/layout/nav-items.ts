import { Briefcase, Calendar, CalendarDays, Clock, type LucideIcon } from "lucide-react";

import type { Role } from "@swiftslip/shared/types";

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

/**
 * The sidebar's nav, grouped exactly as the portal mock lays it out.
 *
 * Deliberately WITHOUT an "Account / My Account" row: the profile block at the
 * bottom of every sidebar is the account entry point (it is a link to
 * `/profile`), so a second route to the same page only added a nav row nobody
 * needed.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Records & Forms",
    items: [
      { label: "Daily Time Record", to: "/records", icon: Clock },
      { label: "Official Business", to: "/official-business", icon: Briefcase },
      { label: "Leave of Absence", to: "/leave-of-absence", icon: Calendar },
      { label: "Change of Schedule", to: "/change-of-schedule", icon: CalendarDays },
      { label: "Overtime", to: "/overtime", icon: Clock },
    ],
  },
];

export function roleLabel(role: Role | undefined) {
  return role === "admin" ? "Administrator" : "Staff";
}

/**
 * The caption under the name in a sidebar footer — **Role - Position**
 * ("Administrator - IT Support"), falling back to the role alone when the
 * profile has no position yet, so the line never ends on a dangling dash.
 * Replaces the hard-coded "HR reviewer" caption: the same account reads
 * differently in each shell, but its own role and title never change.
 */
export function accountCaption(role: Role | undefined, position?: string | null): string {
  const title = (position ?? "").trim();
  return title ? `${roleLabel(role)} - ${title}` : roleLabel(role);
}
