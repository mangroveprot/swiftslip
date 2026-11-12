import { toast as sonnerToast } from "sonner";

import { ApiError } from "@/lib/api-client";

/**
 * Thin wrapper around sonner's `toast` so every action in the app (save, edit,
 * delete, import…) reports success/failure the same way, from one place.
 *
 * Usage:
 *   toast.success("Password saved");
 *   toast.error("Could not save that password.");
 *   const id = toast.loading("Saving…");
 *   toast.success("Saved", { id }); // replaces the loading toast
 */
export const toast = {
  success: (message: string, options?: Parameters<typeof sonnerToast.success>[1]) =>
    sonnerToast.success(message, options),
  error: (message: string, options?: Parameters<typeof sonnerToast.error>[1]) =>
    sonnerToast.error(message, options),
  warning: (message: string, options?: Parameters<typeof sonnerToast.warning>[1]) =>
    sonnerToast.warning(message, options),
  info: (message: string, options?: Parameters<typeof sonnerToast>[1]) =>
    sonnerToast(message, options),
  loading: (message: string, options?: Parameters<typeof sonnerToast.loading>[1]) =>
    sonnerToast.loading(message, options),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};

/**
 * Turn a thrown value into one sentence a person can act on.
 *
 * Server messages are written for debugging (error codes, zod paths, Postgres
 * text, JSON bodies). Repeating them verbatim in a toast makes an ordinary
 * "please fill this in" moment look like a crash. A few known codes get their
 * own plain copy; anything else is only shown when it is short and readable,
 * otherwise the caller's friendly fallback wins.
 */
export function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "NETWORK_ERROR":
        return "You appear to be offline. Check your connection and try again.";
      case "UNAUTHORIZED":
        return "Your session expired. Please sign in again.";
      case "FORM_LOCKED":
        return "This form is already with HR. Ask HR to send it back if it still needs changes.";
      case "VALIDATION_ERROR":
        return "Some details could not be saved. Check the form and try again.";
      case "REQUIRED_FIELD_MISSING":
        return "Some required details are still empty. They are marked in the form.";
      default:
        break;
    }
  }

  const raw = error instanceof Error ? error.message.trim() : "";
  // Codes, JSON/SQL, stack traces and long server dumps are not user-facing copy.
  const looksTechnical =
    /^[A-Z_]{4,}$/.test(raw) ||
    /\b(?:postgrest|supabase|stack|syntax error|undefined|null)\b/i.test(raw) ||
    ["{", "}", "[", "]"].some((char) => raw.includes(char));
  if (!raw || raw.length > 160 || looksTechnical) return fallback;
  return raw;
}
