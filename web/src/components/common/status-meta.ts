import {
  Briefcase,
  CheckCircle2,
  Clock,
  FileText,
  Hourglass,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { ObHrStatus } from "@swiftslip/shared/hr";

/** The semantic colours a status can use across SwiftSlip and HR. */
export type StatusTone =
  "neutral" | "info" | "success" | "complete" | "warning" | "danger" | "primary" | "brand";

/** `soft` is the tinted chip, `solid` the filled chip, `tab` the folder tab, `plain` icon + label, `dot` a dot + label. */
export type StatusBadgeVariant = "soft" | "solid" | "tab" | "plain" | "dot";

export type ObStatusMeta = {
  tone: StatusTone;
  icon: LucideIcon;
  /** Background class for the filled status dot in the `dot` variant. */
  dot: string;
  /**
   * Optional hollow-ring class for the `dot` variant, drawn instead of `dot`.
   * The HR queue reference marks a pending "Waiting for Supervisor" with an
   * outlined ring so it reads differently from the filled "On OB" dot. It is a
   * hairline (1px, not 2px), smaller than the filled dot, and pulses once per
   * couple of seconds — see `.status-ring-pulse` in styles.css.
   */
  dotRing?: string;
  /** Default surface for this status. Omitted means `soft`. */
  variant?: "soft" | "solid";
};

/**
 * The one place that describes an OB status: tone, icon and dot. Labels live
 * beside it in `@swiftslip/shared/hr`. Add a status here and every badge,
 * header, card and queue that renders it stays in sync. The employee list card
 * deliberately does NOT take a colour from here — its box stays neutral grey
 * and only the folder-tab badge carries the status colour.
 */
export const OB_STATUS_META: Record<ObHrStatus, ObStatusMeta> = {
  draft: {
    tone: "neutral",
    icon: FileText,
    dot: "bg-muted-foreground",
  },
  submitted: {
    tone: "info",
    icon: Clock,
    dot: "bg-blue-500",
  },
  waiting_supervisor: {
    tone: "warning",
    icon: Hourglass,
    dot: "bg-amber-500",
    dotRing:
      "status-ring-pulse size-1.5 border border-amber-500 bg-transparent dark:border-amber-400",
  },
  approved: {
    tone: "info",
    icon: UserCheck,
    dot: "bg-blue-700",
  },
  rejected: {
    tone: "danger",
    icon: XCircle,
    dot: "bg-destructive",
  },
  departed: {
    tone: "brand",
    icon: Briefcase,
    dot: "bg-logo",
  },
  completed: {
    tone: "complete",
    icon: CheckCircle2,
    dot: "bg-success",
    variant: "solid",
  },
};
