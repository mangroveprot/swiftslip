import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { sessionQueryOptions } from "@/features/auth/queries";
import { toast } from "@/lib/toast";
import { relativeTime } from "@/shared/time";
import type { Role } from "@/shared/types";
import { accessCodesQueryOptions } from "../queries";

type Account = {
  id: string;
  label: string;
  id_number: string;
  role: Role;
  created_at: string;
};

function roleText(role: string) {
  return role === "admin" ? "Administrator" : "Staff";
}

/**
 * User management for the admin panel: search the accounts, create one with its
 * unique ID number + password, then rename it, change its ID/role or reset its
 * password. (This replaces the old "Access passwords" list — same server
 * functions, no more "Name" field on creation.)
 */
export function UserManagement() {
  const { data: session } = useQuery(sessionQueryOptions());
  const qc = useQueryClient();
  const { data: accounts, isLoading } = useQuery(accessCodesQueryOptions());
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [removing, setRemoving] = useState<Account | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: accessCodesQueryOptions().queryKey });

  const query = search.trim().toLowerCase();
  const list = (accounts ?? []).filter((a) =>
    `${a.id_number} ${a.label ?? ""} ${roleText(a.role)} ${a.role}`.toLowerCase().includes(query),
  );

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await deleteCode({ data: { id: removing.id } });
      refresh();
      toast.success(`Removed "${removing.id_number}"`);
      setRemoving(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that account.");
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">User management</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every account signs in with its unique ID number and password. Administrators can edit
            records, import files and manage this list; staff can only view, print and download.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden="true" />
          Create account
        </button>
      </div>

      <div className="relative mt-5">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by ID number, name or access level…"
          className="pl-9"
          aria-label="Search accounts"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 w-full animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {accounts?.length
              ? `No accounts match “${search.trim()}”.`
              : "No accounts yet — create one above."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">ID number</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Name</th>
                <th className="px-4 py-2.5 font-medium">Access</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Created</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((a) => {
                const isYou = a.id === session?.id;
                return (
                  <tr key={a.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <span className="font-medium tabular-nums">{a.id_number}</span>
                      {isYou ? (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          You
                        </span>
                      ) : null}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {a.label && a.label !== a.id_number ? a.label : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          a.role === "admin"
                            ? "inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            : "inline-flex rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                        }
                      >
                        {roleText(a.role)}
                      </span>
                    </td>
                    <td
                      className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell"
                      title={new Date(a.created_at).toLocaleString()}
                    >
                      {relativeTime(a.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                          aria-label={`Edit ${a.id_number}`}
                          title="Edit"
                          onClick={() => setEditing({ ...a, role: a.role as Role })}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        {isYou ? null : (
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                            aria-label={`Remove ${a.id_number}`}
                            title="Remove"
                            onClick={() => setRemoving({ ...a, role: a.role as Role })}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <AccountDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && !removeBusy && setRemoving(null)}
        title={`Remove "${removing?.id_number}"?`}
        description="Anyone still signed in with this account will keep working until their session expires, but they won't be able to sign back in. This can't be undone."
        confirmLabel="Remove"
        busy={removeBusy}
        onConfirm={confirmRemove}
      />
    </section>
  );
}

/** Create ("new") and edit share one dialog — same fields, different labels
 *  and validation. Blank password on edit keeps the current one. */
function AccountDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: Account | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === "new";
  const account = editing !== "new" ? editing : null;
  const [idNumber, setIdNumber] = useState("");
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed the form whenever a different account (or "new") is opened.
  const openKey = editing === null ? null : isNew ? "new" : (account?.id ?? null);
  const [openId, setOpenId] = useState<string | null>(null);
  if (openKey && openKey !== openId) {
    setOpenId(openKey);
    setIdNumber(isNew ? "" : (account?.id_number ?? ""));
    setLabel(isNew ? "" : (account?.label ?? ""));
    setRole(isNew ? "user" : (account?.role ?? "user"));
    setPassword("");
  }

  async function save() {
    if (editing === null) return;
    if (!idNumber.trim()) {
      toast.error("Enter the ID number.");
      return;
    }
    if (isNew && !password) {
      toast.error("Enter a password for the new account.");
      return;
    }
    setBusy(true);
    try {
      await upsertCode({
        data: {
          idNumber: idNumber.trim(),
          role,
          // Create: the password is the account's first one (required above).
          // Edit: blank = keep the existing password — only rehash when given.
          password: password || undefined,
          ...(account ? { id: account.id, label } : {}),
        },
      });
      toast.success(isNew ? "Account created" : "Account updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Create account" : "Edit account"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <TextField
            label="ID Number"
            value={idNumber}
            onChange={setIdNumber}
            placeholder="e.g. 2026-515"
          />
          {isNew ? null : (
            <TextField
              label="Name (display)"
              value={label}
              onChange={setLabel}
              placeholder="Shown in the sidebar — leave blank to show the ID number"
            />
          )}
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
            label={isNew ? "Password" : "Reset password"}
            value={password}
            onChange={setPassword}
            type="password"
            placeholder={isNew ? "" : "Leave blank to keep the current password"}
            autoComplete="new-password"
          />
          {isNew ? (
            <p className="text-xs text-muted-foreground">
              They will sign in with this ID number and password.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? (isNew ? "Creating…" : "Saving…") : isNew ? "Create account" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
