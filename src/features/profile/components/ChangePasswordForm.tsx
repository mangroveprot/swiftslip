import { useState } from "react";

import { changeMyPassword } from "@/api/access-codes.functions";
import { TextField } from "@/components/common/FormField";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const strength = passwordStrength(newPassword);
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function onSubmit() {
    setStatus(null);
    if (newPassword !== confirmPassword) {
      setStatus({ kind: "error", text: "New passwords don't match." });
      return;
    }
    setBusy(true);
    try {
      await changeMyPassword({ data: { currentPassword, newPassword, confirmPassword } });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus({ kind: "ok", text: "Password updated." });
    } catch (e) {
      setStatus({
        kind: "error",
        text: e instanceof Error ? e.message : "Could not update password.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <h2 className="text-lg font-medium">Change password</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Update the password you sign in with. This doesn't affect anyone else's access.
      </p>

      <div className="mt-4 space-y-3">
        <TextField
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          type="password"
          autoComplete="current-password"
        />
        <TextField
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          type="password"
          autoComplete="new-password"
        />
        {newPassword ? (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${strength.color}`}
                style={{ width: `${strength.percent}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{strength.label}</span>
          </div>
        ) : null}
        <TextField
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          type="password"
          autoComplete="new-password"
        />
        {mismatch ? <p className="text-xs text-destructive">Passwords don't match yet.</p> : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            className="btn btn-primary"
            disabled={busy || !currentPassword || newPassword.length < 4 || mismatch}
            onClick={onSubmit}
          >
            {busy ? "Updating…" : "Update password"}
          </button>
          {status ? (
            <span
              className={`text-sm ${status.kind === "ok" ? "text-muted-foreground" : "text-destructive"}`}
            >
              {status.text}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** A quick, local-only heuristic — no data leaves the browser until submit. */
function passwordStrength(password: string): { percent: number; label: string; color: string } {
  if (!password) return { percent: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 4) score += 1;
  if (password.length >= 8) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;

  if (score <= 1) return { percent: 25, label: "Weak", color: "bg-destructive" };
  if (score <= 3) return { percent: 60, label: "Okay", color: "bg-accent" };
  return { percent: 100, label: "Strong", color: "bg-primary" };
}
