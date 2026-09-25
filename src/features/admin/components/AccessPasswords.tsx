import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteCode, upsertCode } from "@/api/access-codes.functions";
import { TextField } from "@/components/common/FormField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Role } from "@/shared/types";
import { accessCodesQueryOptions } from "../queries";

type AccessCode = { id: string; label: string; role: Role };

export function AccessPasswords() {
  const qc = useQueryClient();
  const { data: codes } = useQuery(accessCodesQueryOptions());
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<AccessCode | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: accessCodesQueryOptions().queryKey });

  async function add() {
    setError("");
    try {
      await upsertCode({ data: { label: label || "Access", role, password } });
      setLabel("");
      setPassword("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that password.");
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await deleteCode({ data: { id } });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that password.");
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
        {(codes ?? []).map((c) => (
          <li key={c.id} className="flex items-center gap-4 px-4 py-3 text-sm">
            <span className="font-medium">{c.label}</span>
            <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wider text-muted-foreground">
              {c.role === "admin" ? "Administrator" : "Staff"}
            </span>
            <div className="ml-auto flex items-center gap-4">
              <button
                className="text-primary hover:underline"
                onClick={() => setEditing({ id: c.id, label: c.label, role: c.role as Role })}
              >
                Edit
              </button>
              <button className="text-destructive hover:underline" onClick={() => remove(c.id)}>
                Remove
              </button>
            </div>
          </li>
        ))}
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
        <button className="btn btn-primary self-end" onClick={add}>
          Add password
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <EditPasswordDialog
        code={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
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
  const [error, setError] = useState("");

  // Re-seed the form whenever a different row is opened for editing.
  const [openId, setOpenId] = useState<string | null>(null);
  if (code && code.id !== openId) {
    setOpenId(code.id);
    setLabel(code.label);
    setRole(code.role);
    setNewPassword("");
    setError("");
  }

  async function save() {
    if (!code) return;
    setBusy(true);
    setError("");
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
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={code !== null} onOpenChange={(open) => !open && onClose()}>
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
