import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { deleteCode, upsertCode } from "@/api/access-codes.functions";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { TextField } from "@/components/common/FormField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/features/auth/use-session";
import { toast } from "@/lib/toast";
import type { Role } from "@/shared/types";
import { accessCodesQueryOptions } from "../queries";

type AccessCode = { id: string; label: string; role: Role };

export function AccessPasswords() {
  const session = useSession();
  const qc = useQueryClient();
  const { data: codes } = useQuery(accessCodesQueryOptions());
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AccessCode | null>(null);
  const [removing, setRemoving] = useState<AccessCode | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: accessCodesQueryOptions().queryKey });

  async function add() {
    setAdding(true);
    try {
      await upsertCode({ data: { label: label || "Access", role, password } });
      setLabel("");
      setPassword("");
      refresh();
      toast.success("Password added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that password.");
    } finally {
      setAdding(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await deleteCode({ data: { id: removing.id } });
      refresh();
      toast.success(`Removed "${removing.label}"`);
      setRemoving(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that password.");
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="text-2xl">Access passwords</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Anyone with an administrator password can edit records, import files and change this list.
        Other passwords can only view, print and download.
      </p>

      <ul className="mt-6 divide-y rounded-lg border">
        {(codes ?? []).map((c) => {
          const isYou = c.id === session?.id;
          return (
            <li key={c.id} className="flex items-center gap-4 px-4 py-3 text-sm">
              <span className="font-medium">{c.label}</span>
              <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wider text-muted-foreground">
                {c.role === "admin" ? "Administrator" : "Staff"}
              </span>
              {isYou ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  You
                </span>
              ) : null}
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                  aria-label={`Edit ${c.label}`}
                  title="Edit"
                  onClick={() => setEditing({ id: c.id, label: c.label, role: c.role as Role })}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
                {isYou ? null : (
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                    aria-label={`Remove ${c.label}`}
                    title="Remove"
                    onClick={() => setRemoving({ id: c.id, label: c.label, role: c.role as Role })}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {(codes ?? []).length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            No passwords yet — add one below.
          </li>
        ) : null}
      </ul>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <TextField label="Name" value={label} onChange={setLabel} />
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Access level
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="user">Staff</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <TextField
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="new-password"
        />
        <button className="btn btn-primary self-end" disabled={adding} onClick={add}>
          {adding ? "Adding…" : "Add password"}
        </button>
      </div>

      <EditPasswordDialog
        code={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && !removeBusy && setRemoving(null)}
        title={`Remove "${removing?.label}"?`}
        description="Anyone still using this password will be signed out and won't be able to sign back in with it. This can't be undone."
        confirmLabel="Remove"
        busy={removeBusy}
        onConfirm={confirmRemove}
      />
    </section>
  );
}

function EditPasswordDialog({
  code,
  onClose,
  onSaved,
}: {
  code: AccessCode | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed the form whenever a different row is opened for editing.
  const [openId, setOpenId] = useState<string | null>(null);
  if (code && code.id !== openId) {
    setOpenId(code.id);
    setLabel(code.label);
    setRole(code.role);
    setNewPassword("");
  }

  async function save() {
    if (!code) return;
    setBusy(true);
    try {
      await upsertCode({
        data: {
          id: code.id,
          label,
          role,
          // Blank = keep the existing password; the service only rehashes when given one.
          password: newPassword || undefined,
        },
      });
      toast.success("Password updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={code !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit password</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <TextField label="Name" value={label} onChange={setLabel} />
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Access level
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="user">Staff</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <TextField
            label="Reset password"
            value={newPassword}
            onChange={setNewPassword}
            type="password"
            placeholder="Leave blank to keep the current password"
            autoComplete="new-password"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
