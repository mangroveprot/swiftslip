import {
  Bell,
  CheckCircle2,
  LogOut,
  RotateCcw,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * How a notification row looks at a glance: the icon in the leading circle
 * and the tone of that circle, keyed by `notifications.kind`.
 *
 * The kinds are the flow itself — submitted → approved / rejected → resubmitted
 * → departure signed — so the icon carries the outcome before the title is
 * read. Tones reuse existing tokens only (`primary`, `success`, `destructive`,
 * the logo orange) so both themes stay correct without new colour values.
 * An unknown kind falls back to the bell rather than an empty circle.
 */
export type NotificationMeta = {
  icon: LucideIcon;
  /** Tailwind classes for the icon's circle. */
  tone: string;
};

const META: Record<string, NotificationMeta> = {
  ob_submitted: { icon: Send, tone: "bg-primary/10 text-primary" },
  ob_approved: { icon: CheckCircle2, tone: "bg-success/15 text-success" },
  ob_rejected: { icon: XCircle, tone: "bg-destructive/10 text-destructive" },
  ob_resubmitted: { icon: RotateCcw, tone: "bg-logo/15 text-logo-ink" },
  ob_departure_signed: { icon: LogOut, tone: "bg-muted text-muted-foreground" },
};

export function notificationMeta(kind: string): NotificationMeta {
  return META[kind] ?? { icon: Bell, tone: "bg-muted text-muted-foreground" };
}
