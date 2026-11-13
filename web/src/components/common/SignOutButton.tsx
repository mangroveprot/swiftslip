import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { signOut } from "@/api/auth.functions";
import { APP } from "@/config/app";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { resetOnboardingSession } from "@/features/profile/onboarding";

/**
 * The one sign-out flow, confirmation warning + cancel queries → clear cache
 * → sign out → back to the login screen. Exposed as a hook because two
 * triggers render it differently: `SignOutButton` (app chooser, inventory) and
 * the sidebar identity menu (`AccountMenu`). Neither re-implements the flow.
 */
// The hook and its trigger live together so the sign-out flow has exactly one
// copy; the component file split would only move this warning, not fix it.
// eslint-disable-next-line react-refresh/only-export-components
export function useSignOutFlow({
  accessName,
  onSignOutStart,
}: {
  /** Named in the warning ("…sign in again to access <name>"). */
  accessName?: string | undefined;
  /** Runs right before signing out, e.g. to close an open menu. */
  onSignOutStart?: (() => void) | undefined;
} = {}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function handleSignOut() {
    setBusy(true);
    onSignOutStart?.();
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      // Signing in again is a fresh chance to finish the profile. Sign-in also
      // resets this, which covers expired sessions and a different account.
      resetOnboardingSession();
      await signOut();
      void navigate({ to: "/", replace: true });
    } catch (e) {
      // A failed sign-out should drop the modal so the user can retry rather
      // than being stuck on a spinner with no way out.
      setBusy(false);
      setConfirmOpen(false);
      throw e;
    }
  }

  return {
    /** Open the confirmation dialog. */
    open: () => setConfirmOpen(true),
    /** Render this once, outside the trigger's portal/menu. */
    modal: (
      <ConfirmModal
        isOpen={confirmOpen}
        title="Sign out?"
        message={`You're about to sign out. You'll need to sign in again to access ${accessName ?? APP.name}.`}
        confirmLabel="Sign out"
        busy={busy}
        busyLabel="Signing out…"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleSignOut()}
      />
    ),
  };
}

/**
 * The one Sign out button, icon + the shared confirmation flow. Every surface
 * that still needs a standalone button (app chooser, inventory sidebar) renders
 * this; the main sidebars put Sign out inside the identity menu instead.
 *
 * <SignOutButton className="btn btn-outline w-full" />
 */
type SignOutButtonProps = {
  /** Button classes, defaults to the plain header/footer button. */
  className?: string;
  /** Names the surface in the confirmation ("…sign in again to access <name>"). */
  accessName?: string;
  /** Runs right before signing out, e.g. to close an open menu. */
  onSignOutStart?: () => void;
  /**
   * Drops the "Sign out" label below `sm`, leaving the icon (still labelled for
   * screen readers). For tight headers where the full word would collide with
   * the brand mark; footers and menus keep the text.
   */
  compact?: boolean;
};

export function SignOutButton({
  className = "btn btn-outline",
  accessName,
  onSignOutStart,
  compact = false,
}: SignOutButtonProps) {
  const { open, modal } = useSignOutFlow({ accessName, onSignOutStart });

  return (
    <>
      <button type="button" className={className} onClick={open} aria-label="Sign out">
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        <span className={compact ? "hidden sm:inline" : undefined}>Sign out</span>
      </button>
      {modal}
    </>
  );
}
