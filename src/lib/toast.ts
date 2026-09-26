import { toast as sonnerToast } from "sonner";

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
  info: (message: string, options?: Parameters<typeof sonnerToast>[1]) =>
    sonnerToast(message, options),
  loading: (message: string, options?: Parameters<typeof sonnerToast.loading>[1]) =>
    sonnerToast.loading(message, options),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};

/** Runs an async action and reports the outcome as a toast, returning the result (or undefined on failure). */
export async function toastAction<T>(
  action: () => Promise<T>,
  messages: { loading?: string; success: string; error?: string },
): Promise<T | undefined> {
  const id = messages.loading ? toast.loading(messages.loading) : undefined;
  try {
    const result = await action();
    toast.success(messages.success, id ? { id } : undefined);
    return result;
  } catch (e) {
    const text = e instanceof Error ? e.message : (messages.error ?? "Something went wrong.");
    toast.error(text, id ? { id } : undefined);
    return undefined;
  }
}
