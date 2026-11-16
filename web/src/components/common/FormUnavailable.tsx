import { useNavigate } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";

import { ErrorState } from "./ErrorState";
import { ErrorStateFromError } from "./ErrorStateFromError";
import { isRowUnavailable } from "@/lib/error-state-copy";

/**
 * Shown when an editor's row cannot be read at all.
 *
 * Two quite different failures used to land here as one, and one of them hung:
 *
 * - **The row is gone** — deleted, or the URL is a stale bookmark. `404`, and a
 *   malformed id the API rejects with `400`. Both mean "this URL names no form",
 *   so both get this screen: "Anything you had already saved is not affected" is
 *   the fact this case has to carry.
 * - **The server is unreachable** — offline, `5xx`, `503`, `401`. That is not a
 *   deletion, so it gets the shared map's words and a `Try again` instead.
 *
 * The gate that used to choose between them read the *message*
 * (`/not found/i`), so anything else — a `400`, a network blip — fell through to
 * `if (!row) return <Skeleton />` and left the editor loading forever. The
 * status is now the only thing consulted, and the caller only reaches this
 * screen when the row is genuinely absent.
 *
 * `backTo` is the route of the list this form belongs to, so the user has one
 * obvious way out instead of the browser back button.
 */
export function FormUnavailable({
  backTo,
  label,
  error,
  onRetry,
  retrying = false,
}: {
  backTo: string;
  label: string;
  /** The failed load. A row that is gone and a server that is down read differently. */
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const navigate = useNavigate();
  const gone = isRowUnavailable(error);

  if (!gone) {
    return (
      <ErrorStateFromError
        className="min-h-full justify-center"
        error={error}
        {...(onRetry ? { onRetry } : {})}
        retrying={retrying}
        secondaryAction={{
          label: `Back to ${label}`,
          onClick: () => void navigate({ to: backTo }),
        }}
      />
    );
  }

  return (
    <ErrorState
      className="min-h-full justify-center"
      icon={FileQuestion}
      title="This form is no longer available"
      description="It may have been deleted, or the link may be out of date. Anything you had already saved is not affected."
      primaryAction={{ label: `Back to ${label}`, onClick: () => void navigate({ to: backTo }) }}
      secondaryAction={{ label: "Go home", onClick: () => void navigate({ to: "/" }) }}
    />
  );
}
