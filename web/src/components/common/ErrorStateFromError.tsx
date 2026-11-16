/**
 * The shared `ErrorState`, wired to a failed request: it turns the error into
 * copy through `describeErrorState`, picks the glyph from the status, and only
 * offers `Try again` when trying again could actually change the outcome.
 *
 * This is the one call every screen makes:
 *
 *   <ErrorStateFromError error={error} onRetry={refetch} retrying={isFetching} />
 *   <ErrorStateFromError error={error} density="page" onRetry={retry} />
 *   <ErrorStateFromError
 *     error={error}
 *     secondaryAction={{ label: "Back to Assets", onClick: goBack }}
 *   />
 *
 * `title` and `description` are the escape hatch for a context the status
 * alone cannot describe (a row that is gone reads differently from a route
 * that 404s). Everything else — the footer, the clipboard payload, the retry
 * policy — stays the map's decision, so two screens can never disagree about
 * what a 503 says.
 */
import { ErrorState, type ErrorStateAction, type ErrorStateDensity } from "./ErrorState";
import { describeErrorState } from "@/lib/error-state-copy";

type ErrorStateFromErrorProps = {
  error: unknown;
  /** Offered only when `describeErrorState` says a retry can succeed. */
  onRetry?: () => void;
  /** A retry is in flight: keeps the button from firing twice. */
  retrying?: boolean;
  /** Filled-action label when `onRetry` is used. Defaults to "Try again". */
  retryLabel?: string;
  density?: ErrorStateDensity;
  /** Quiet way out, e.g. back to the list this row belonged to. */
  secondaryAction?: ErrorStateAction;
  /** Context copy that the status alone cannot produce. */
  title?: string;
  description?: string;
  /** Turn off for a block that re-renders inside a list. */
  announce?: boolean;
  /** When the request failed; defaults to now. */
  at?: Date | null;
  className?: string;
};

export function ErrorStateFromError({
  error,
  onRetry,
  retrying = false,
  retryLabel,
  density,
  secondaryAction,
  title,
  description,
  announce,
  at,
  className,
}: ErrorStateFromErrorProps) {
  const path = typeof window === "undefined" ? null : window.location.pathname;
  const info = describeErrorState(error, path ? { at: at ?? null, path } : { at: at ?? null });
  // The policy lives in the map: a retry on a 400/403/404/409 would repeat the
  // same refusal, so the button is withheld rather than shown and failing.
  const retry = onRetry && info.retry ? onRetry : undefined;
  // A signed-out block must not be a dead end. Sign-in is `/` in this app, and
  // a hard navigation there is deliberate: it drops the stale session and every
  // cached query, which is the only reliable way out of a 401.
  const signIn: ErrorStateAction | undefined =
    info.statusCode === 401
      ? { label: "Sign in", onClick: () => window.location.assign("/") }
      : undefined;

  return (
    <ErrorState
      icon={info.icon}
      title={title ?? info.title}
      description={description ?? info.description}
      density={density ?? "section"}
      retrying={retrying}
      details={info.details}
      meta={info.meta}
      {...(className ? { className } : {})}
      {...(retry ? { onRetry: retry } : {})}
      {...(retryLabel ? { retryLabel } : {})}
      {...(signIn ? { primaryAction: signIn } : {})}
      {...(secondaryAction ? { secondaryAction } : {})}
      {...(announce === undefined ? {} : { announce })}
    />
  );
}
