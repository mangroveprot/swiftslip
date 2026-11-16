/**
 * Turns a failed request into the copy the shared `ErrorState` shows: the glyph,
 * a plain-language title and one sentence, whether a retry could change the
 * outcome, the `Error 503 · …` footer, and the full payload behind
 * "Copy error details".
 *
 * The API's own message is deliberately kept out of the visible copy — it is
 * written for developers ("Set RGC_INVENTORY_DATABASE_URL…", Postgres
 * constraint names, zod paths) — and travels in `details` instead. The one
 * exception is a business refusal (409): there the server sentence *is* the
 * instruction ("Ask HR to reject it if it needs changes"), so it is shown.
 *
 * Nine identities reach this map, and each has exactly one treatment:
 *
 *   status 0   Can't reach the server      retry
 *   401        You've been signed out      no retry, no timestamp
 *   403        You don't have access       no retry, no timestamp
 *   404        We can't find this page     no retry, no timestamp
 *   409        the refusal, as written     no retry
 *   413 / 415  the file, as written        no retry
 *   429        Too many requests           retry
 *   503        Something went wrong        retry
 *   5xx/other  Something went wrong        retry
 *
 * The retry column is the policy: retrying a 400/403/404/409 repeats the same
 * refusal, so `ErrorStateFromError` withholds the button instead of offering an
 * action that cannot succeed.
 */
import type { LucideIcon } from "lucide-react";
import { CircleAlert, CloudOff, Lock, SearchX, ShieldOff, Timer, WifiOff } from "lucide-react";
import { formatDate, formatTime } from "@swiftslip/shared/time";

import { ApiError } from "@/lib/api-client";

export type ErrorStateInfo = {
  /** 0 for a failed fetch, null when the failure never reached the API. */
  statusCode: number | null;
  code: string | null;
  icon: LucideIcon;
  title: string;
  description: string;
  /** True when trying again could plausibly succeed. */
  retry: boolean;
  /** `Error 503 · Nov 16, 2026, 09:02 AM`, or null when there is nothing to stamp. */
  meta: string | null;
  /** Multi-line clipboard payload for "Copy error details". */
  details: string;
  suggestions: string[];
};

type ErrorStateContext = {
  /** When the request failed; `errorUpdatedAt` from React Query. Defaults to now. */
  at?: Date | null;
  /** Route shown in the clipboard payload, e.g. `/rgc-asset-inventory`. */
  path?: string;
};

/** The 401/403/404 states are navigation answers, not failures to date-stamp. */
const WITHOUT_META = new Set([401, 403, 404]);

/** Zod's own words for a failed schema — never worth showing on their own. */
const PLAIN_VALIDATION = new Set(["Validation error", "The request contains invalid data."]);

const GENERIC = {
  icon: CircleAlert,
  title: "Something went wrong",
  description:
    "We couldn't load this page. Try again, and if the problem continues, contact your system administrator.",
  retry: true,
};

type Copy = Pick<ErrorStateInfo, "icon" | "title" | "description" | "retry">;

function copyFor(status: number | null, code: string | null, message: string): Copy {
  if (status === 0) {
    return {
      icon: WifiOff,
      title: "Can't reach the server",
      description: "Check your connection, then try again.",
      retry: true,
    };
  }
  if (status === 401) {
    return {
      icon: Lock,
      title: "You've been signed out",
      description: "For your security, sign in again to keep working.",
      retry: false,
    };
  }
  if (status === 403) {
    return {
      icon: ShieldOff,
      title: "You don't have access to this page",
      description: "Ask your system administrator to give you access.",
      retry: false,
    };
  }
  if (status === 404) {
    return {
      icon: SearchX,
      title: "We can't find this page",
      description: "It may have been deleted, or the link is out of date.",
      retry: false,
    };
  }
  if (status === 409) {
    // A business refusal explains itself; keep the server's sentence.
    if (code === "FORM_LOCKED") {
      return {
        icon: Lock,
        title: "This form is with HR",
        description:
          message || "It can no longer be edited. Ask HR to reject it if it needs changes.",
        retry: false,
      };
    }
    return {
      icon: Lock,
      title: "This can't be done right now",
      description: message || "Something else is using this. Try again in a moment.",
      retry: false,
    };
  }
  if (status === 413 || status === 415) {
    return {
      icon: CircleAlert,
      title: "That file wasn't accepted",
      description: message || "Pick a different file and try again.",
      retry: false,
    };
  }
  if (status === 429) {
    return {
      icon: Timer,
      title: "Too many requests",
      description: "Please wait a moment, then try again.",
      retry: true,
    };
  }
  // A service that is down still reads as the generic failure; only the glyph
  // is specific (a cloud), so the words stay the ones people already know.
  if (status === 503) {
    return { ...GENERIC, icon: CloudOff };
  }
  if (status === 400 && PLAIN_VALIDATION.has(message)) {
    return {
      icon: CircleAlert,
      title: "That didn't work",
      description: "Check the details and try again.",
      retry: false,
    };
  }
  if (status === 400) {
    return {
      icon: CircleAlert,
      title: "That didn't work",
      description: message || "Check the details and try again.",
      retry: false,
    };
  }
  return GENERIC;
}

export function describeErrorState(
  error: unknown,
  context: ErrorStateContext = {},
): ErrorStateInfo {
  const api = error instanceof ApiError ? error : null;
  const statusCode = api?.status ?? null;
  const code = api?.code ?? null;
  const message =
    api?.message ??
    (error instanceof Error && error.message.trim() !== "" ? error.message : "Unknown error.");
  const copy = copyFor(statusCode, code, message);
  const at = context.at ?? new Date();
  const suggestions = api?.suggestions ?? [];
  const statusLabel =
    statusCode == null ? null : statusCode === 0 ? "No connection" : `Error ${statusCode}`;

  return {
    ...copy,
    statusCode,
    code,
    meta:
      statusLabel == null || WITHOUT_META.has(statusCode ?? -1)
        ? null
        : `${statusLabel} · ${formatDate(at)}, ${formatTime(at)}`,
    details: [
      `Page: ${context.path ?? "unknown"}`,
      `When: ${at.toISOString()}`,
      `Status: ${statusCode == null ? "n/a" : `${statusCode}${code ? ` ${code}` : ""}`}`,
      `Message: ${message}`,
      ...(suggestions.length > 0 ? [`Suggestions: ${suggestions.join(" | ")}`] : []),
    ].join("\n"),
    suggestions,
  };
}

/**
 * Whether a failed row fetch means "this URL names nothing" — the row was
 * deleted, or the API rejected the id (`400` from `validate(idInput, 'params')`)
 * — rather than "the server is in trouble".
 *
 * Editors choose between the "no longer available" screen and the shared
 * failure block with this. They used to read the *message* (`/not found/i`), so
 * a 400, a 500 or an offline fetch all fell through to the loading skeleton,
 * and with `retry: false` that skeleton never resolved.
 */
export function isRowUnavailable(error: unknown): boolean {
  const status = error instanceof ApiError ? error.status : null;
  return status === 400 || status === 404;
}
