/**
 * One quiet block for "this part of the app could not load", used the same way
 * everywhere: a neutral icon tile, one sentence of plain language, one filled
 * action, and the technical facts kept out of the way — a tiny
 * `Error 503 · Nov 16, 2026, 09:02 AM` line plus `Copy error details`.
 *
 * Same layout for every cause; only the icon, the words and the action change:
 *
 *   <ErrorState
 *     title="Something went wrong"
 *     description="We couldn't load this page. Try again, and if the problem
 *       continues, contact your system administrator."
 *     onRetry={retry}
 *     retrying={isFetching}
 *     details={details}
 *     meta="Error 503 · Nov 16, 2026, 09:02 AM"
 *   />
 *
 *   <ErrorState icon={Lock} title="You've been signed out"
 *     description="For your security, sign in again to keep working."
 *     primaryAction={{ label: "Sign in", onClick: signIn }} />
 *
 *   <ErrorState icon={SearchX} title="We can't find that asset"
 *     description="It may have been deleted, or the link is out of date."
 *     secondaryAction={{ label: "Back to Assets", onClick: goBack }}
 *     details={details} />
 *
 * Rules that keep it calm: the icon tile is always neutral (never a red
 * alarm), the description stays one or two lines, there is at most one filled
 * action, and the API's raw message never appears here — it belongs in
 * `details`, which is what Copy error details puts on the clipboard.
 *
 * `density` only decides where the block sits, never how it looks:
 * `section` (the default) fills the space the content would have used;
 * `page` fills the viewport, for a route that could not load at all.
 *
 * `onRetry` is the common case and is just sugar for the filled action the
 * error state always has — one "Try again" that knows how to show a retry is
 * in flight. An explicit `primaryAction` wins when the caller needs different
 * words or a different icon.
 *
 * The filled action takes its colour from `--error-state-accent` when the
 * surrounding theme sets one (the inventory theme points it at its deep
 * orange), and falls back to the app's `--primary`.
 */
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, RotateCw } from "lucide-react";

import { cn } from "@/lib/utils";

export type ErrorStateAction = {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  /** Shows `busyLabel` and disables the button while the action is in flight. */
  busy?: boolean;
  busyLabel?: string;
};

/** `section` fills the content area; `page` fills the viewport. */
export type ErrorStateDensity = "section" | "page";

export type ErrorStateProps = {
  /** Line icon in the tile. Defaults to `CircleAlert`. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Where the block sits. Defaults to `section`. */
  density?: ErrorStateDensity;
  /** The one filled action, e.g. Try again / Sign in / Back to Assets. */
  primaryAction?: ErrorStateAction;
  /** Shorthand for a filled "Try again". Ignored when `primaryAction` is set. */
  onRetry?: () => void;
  /** A retry is in flight: disables it and shows "Trying again…". */
  retrying?: boolean;
  /** Filled-action label when `onRetry` is used. Defaults to "Try again". */
  retryLabel?: string;
  /** Quiet action, e.g. Go back. Stays alongside Copy error details. */
  secondaryAction?: ErrorStateAction;
  /** Clipboard payload for the "Copy error details" action. */
  details?: string | null;
  /** Technical footer, e.g. `Error 503 · Nov 16, 2026, 09:02 AM`. */
  meta?: string | null;
  /**
   * Announces the block with `role="alert"` when it appears. Turn it off for a
   * block that re-renders inside a list, where interrupting would be noise.
   */
  announce?: boolean;
  className?: string;
};

export function ErrorState({
  icon: Icon = CircleAlert,
  title,
  description,
  density = "section",
  primaryAction,
  onRetry,
  retrying = false,
  retryLabel = "Try again",
  secondaryAction,
  details,
  meta,
  announce = true,
  className,
}: ErrorStateProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copyDetails = async () => {
    if (!details) return;
    try {
      await navigator.clipboard.writeText(details);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const primary: ErrorStateAction | undefined =
    primaryAction ??
    (onRetry
      ? {
          label: retryLabel,
          onClick: onRetry,
          icon: RotateCw,
          busy: retrying,
          busyLabel: "Trying again…",
        }
      : undefined);

  const PrimaryIcon = primary?.icon;
  const hasActions = Boolean(primary || secondaryAction || details);

  return (
    <div
      className={cn("error-state", density === "page" && "error-state--page", className)}
      role={announce ? "alert" : undefined}
    >
      <span className="error-state__icon" aria-hidden="true">
        <Icon className="size-5" strokeWidth={1.5} />
      </span>

      <h2 className="error-state__title">{title}</h2>
      {description ? <p className="error-state__text">{description}</p> : null}

      {hasActions ? (
        <div className="error-state__actions">
          {primary ? (
            <button
              type="button"
              className="error-state__primary"
              disabled={primary.busy}
              aria-busy={primary.busy || undefined}
              onClick={primary.onClick}
            >
              {PrimaryIcon ? <PrimaryIcon className="size-3.5" aria-hidden="true" /> : null}
              {primary.busy ? (primary.busyLabel ?? primary.label) : primary.label}
            </button>
          ) : null}

          {secondaryAction ? (
            <button
              type="button"
              className="error-state__secondary"
              disabled={secondaryAction.busy}
              aria-busy={secondaryAction.busy || undefined}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.busy
                ? (secondaryAction.busyLabel ?? secondaryAction.label)
                : secondaryAction.label}
            </button>
          ) : null}

          {details ? (
            <button type="button" className="error-state__details" onClick={copyDetails}>
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Couldn't copy"
                  : "Copy error details"}
            </button>
          ) : null}
        </div>
      ) : null}

      {meta ? <p className="error-state__meta">{meta}</p> : null}

      <span className="sr-only" role="status">
        {copyState === "copied" ? "Error details copied to the clipboard" : ""}
      </span>
    </div>
  );
}
