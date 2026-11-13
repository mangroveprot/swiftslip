import { Briefcase, Calendar, CalendarDays, Clock, Receipt, type LucideIcon } from "lucide-react";

import { employerLabel, type Employer } from "@swiftslip/shared/org";
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
      { label: "Statement of Liquidation", to: "/liquidation", icon: Receipt },
    ],
  },
];

export function roleLabel(role: Role | undefined) {
  return role === "admin" ? "Administrator" : "Staff";
}

/**
 * The caption under the name in a sidebar footer, **Employer - Position**
 * ("Mindbridge - IT Support"), falling back to whichever half is known when the
 * profile is still loading or has no position yet, so the line never ends on a
 * dangling dash. The employer replaces the old role caption: the sidebar says
 * which company the account belongs to, not whether it is an administrator.
 */
export function accountCaption(employer: Employer | undefined, position?: string | null): string {
  const company = employer === undefined ? "" : employerLabel(employer);
  const title = (position ?? "").trim();
  return [company, title].filter(Boolean).join(" - ");
}
