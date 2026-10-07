import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { signOut } from "@/api/auth.functions";
import { APP } from "@/config/app";
import { ConfirmModal } from "@/components/common/ConfirmModal";

/**
 * The one Sign out button — icon + confirmation warning + the actual sign-out
 * flow (cancel queries → clear cache → sign out → back to the login screen).
 * Every surface (SwiftSlip sidebar, admin sidebar, app chooser, inventory
 * sidebar) renders this instead of re-implementing any of it.
 *
 * <SignOutButton className="btn btn-outline w-full" />
 */
type SignOutButtonProps = {
  /** Button classes — defaults to the plain header/footer button. */
  className?: string;
  /** Named in the warning ("…sign in again to access <name>"). */
  accessName?: string;
  /** Runs right before signing out — e.g. to close an open menu. */
  onSignOutStart?: () => void;
};

export function SignOutButton({
  className = "btn btn-outline",
  accessName,
  onSignOutStart,
}: SignOutButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function handleSignOut() {
    setConfirmOpen(false);
    onSignOutStart?.();
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    void navigate({ to: "/", replace: true });
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setConfirmOpen(true)}>
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        Sign out
      </button>

      <ConfirmModal
        isOpen={confirmOpen}
        title="Sign out?"
        message={`You're about to sign out. You'll need to sign in again to access ${accessName ?? APP.name}.`}
        confirmLabel="Sign out"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void handleSignOut()}
      />
    </>
  );
}
