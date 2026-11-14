import {
  AlarmClock,
  Briefcase,
  Calendar,
  CalendarDays,
  Clock,
  Receipt,
  type LucideIcon,
} from "lucide-react";

import type { RetentionFormType } from "@swiftslip/shared/schemas";
import { RETENTION_FORM_LABELS } from "@swiftslip/shared/schemas";

/** Display names for the five cleanup checkboxes, shared by the settings
 *  page and the confirm dialog so the two never disagree. Short on purpose:
 *  a by-type row carries a bar, a count and a status on the same line. The
 *  values live with the retention types in `shared` so the API's deletion
 *  notification and the admin receipt name a type identically. */
export const FORM_TYPE_LABELS: Record<RetentionFormType, string> = RETENTION_FORM_LABELS;

/**
 * The tile beside each form type: the same icon the SwiftSlip sidebar gives
 * that form (`components/layout/nav-items.ts`), so a row is recognisable as
 * the page it cleans up rather than as one more line of text. Overtime is the
 * alarm rather than the clock it shares there, because two identical rows
 * side by side read as a mistake.
 *
 * Shared by the retention page and its preview window, so a type looks the
 * same in both.
 */
export const FORM_TYPE_ICONS: Record<RetentionFormType, LucideIcon> = {
  dtr: Clock,
  ob: Briefcase,
  loa: Calendar,
  cos: CalendarDays,
  ot: AlarmClock,
  liq: Receipt,
};
