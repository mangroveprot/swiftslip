import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

import { deleteCode, upsertCode } from "@/api/access-codes.functions";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { TextField } from "@/components/common/FormField";
import { OrgSelect } from "@/components/common/OrgSelect";
import { OrgOptionDialogs, type OrgActionRequest } from "./OrgOptionDialogs";
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
import {
  DEPARTMENTS,
  DESIGNATIONS,
  departmentForPosition,
  normalizeDesignation,
  normalizePosition,
  positionsUnder,
  type OrgLists,
} from "@/shared/org";

import type { Role } from "@/shared/types";
import { accessCodesQueryOptions, orgOptionsQueryOptions } from "../queries";

type Account = {
  id: string;
  /** The employee's real full name, joined in from their profile ("" when unset). */
  full_name: string;
  /** Profile `area` — the office/branch, shown as Designation. */
  designation: string;
  /** Profile `department` — the org unit the position belongs to. */
  department: string;
  /** Profile `designation` — the job title. */
  position: string;
  id_number: string;
  role: Role;
  created_at: string;
};

/** Which chip is selected above the list. */
type Filter = "all" | "admin" | "staff" | "incomplete";

function roleText(role: string) {
  return role === "admin" ? "Administrator" : "Staff";
}

/**
 * The department a row shows: the one stored on the profile, or the one its
 * position implies for rows that were never backfilled / predate migration
 * 0023. The office branch is never a department, so `designation` is not used.
 */
function displayDepartment(a: Account) {
  return a.department.trim() || departmentForPosition(a.position);
}

/**
 * A profile is incomplete until it says who the person is and where they work:
 * the real name, the Designation (office), the Department, and the Position.
 * Anything less and the forms that auto-fill from the profile print blanks.
 */
function isIncomplete(a: Account) {
  return (
    !a.full_name.trim() || !a.designation.trim() || !displayDepartment(a) || !a.position.trim()
  );
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "admin", label: "Administrators" },
  { key: "staff", label: "Staff" },
  { key: "incomplete", label: "Incomplete" },
];

/**
 * User management for the admin panel: search the accounts, create one with its
 * unique ID number + password, then change its ID/role or reset its password.
 *
 * The org columns read the way a form does: Designation is the office the
 * account works at, and the Position it holds sits under a Department (IT
 * Support and IT Programmer under Information Technology) — both stored on the
 * profile, where a position implies its department until one is set. The Name
 * column shows the employee's real full name from their profile — the
 * free-text sidebar label is no longer edited here. (Same server functions as
 * the old "Access passwords" list.)
 */
export function UserManagement() {
  const { data: session } = useQuery(sessionQueryOptions());
  const qc = useQueryClient();
  const { data: accounts, isLoading } = useQuery(accessCodesQueryOptions());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [removing, setRemoving] = useState<Account | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: accessCodesQueryOptions().queryKey });

  const all = accounts ?? [];
  const totals = {
    accounts: all.length,
    admins: all.filter((a) => a.role === "admin").length,
    staff: all.filter((a) => a.role === "user").length,
    incomplete: all.filter(isIncomplete).length,
  };

  const query = search.trim().toLowerCase();
  const list = all.filter((a) => {
    const byChip =
      filter === "all" ? true : filter === "incomplete" ? isIncomplete(a) : a.role === filter;
    if (!byChip) return false;
    if (!query) return true;
    // `displayDepartment` too: a row awaiting backfill still answers to the
    // department its position implies.
    return `${a.id_number} ${a.full_name} ${a.designation} ${a.department} ${a.position} ${displayDepartment(
      a,
    )} ${roleText(a.role)} ${a.role}`
      .toLowerCase()
      .includes(query);
  });

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

  const cards = [
    { label: "Total accounts", value: totals.accounts, tone: "" },
    { label: "Administrators", value: totals.admins, tone: "" },
    { label: "Staff", value: totals.staff, tone: "" },
    {
      label: "Incomplete profiles",
      value: totals.incomplete,
      tone: totals.incomplete > 0 ? "border-amber-300 bg-amber-50" : "",
    },
  ];

  return (
    // The blurb stays visible at every width, but small and one short line, so
    // the header never fills a short window on its own. Same sizing as the App
    // access screen; desktop layout and colours are unchanged.
    <section className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl">User management</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Every account signs in with its unique ID number and password. Administrators can edit
            records, import files and manage this list; staff can only view, print and download.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden="true" />
          Create account
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-xl border bg-card p-2.5 ${card.tone}`}>
            <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
            <p
              className={`mt-0.5 text-xs font-medium ${
                card.tone ? "text-amber-800" : "text-muted-foreground"
              }`}
            >
              {card.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <div className="relative w-full sm:w-72 sm:flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground md:left-3"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, name, position or department…"
            className="h-8 pl-8 text-sm md:h-9 md:pl-9"
            aria-label="Search accounts"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`h-7 rounded-full border px-2.5 text-xs transition-colors sm:h-8 sm:px-3 ${
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border">
        {isLoading ? (
          <div className="space-y-2 p-4" aria-label="Loading accounts">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="h-9 min-w-0 flex-1 animate-pulse rounded-md bg-muted/60 px-3 py-2" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">
              {all.length ? "No accounts match your filters" : "No accounts yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {all.length
                ? `Nothing matches “${search.trim()}”. Try a different keyword — or switch the filter.`
                : "Create one above to get started."}
            </p>
          </div>
        ) : (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="min-w-56 px-4 py-3 font-semibold">Account</th>
                  <th className="w-44 px-4 py-3 font-semibold">Designation</th>
                  <th className="w-64 px-4 py-3 font-semibold">Position / Department</th>
                  <th className="w-32 px-4 py-3 font-semibold">Access</th>
                  <th className="w-28 px-4 py-3 font-semibold">Created</th>
                  <th className="w-20 px-4 py-3 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((a) => {
                  const isYou = a.id === session?.id;
                  const incomplete = isIncomplete(a);
                  const shownDepartment = displayDepartment(a);
                  return (
                    <tr key={a.id} className="transition-colors hover:bg-muted/40">
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex items-center gap-3">
                          {a.full_name ? (
                            <span
                              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                              aria-hidden="true"
                            >
                              {initialsOf(a.full_name)}
                            </span>
                          ) : (
                            <span
                              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed bg-muted text-xs font-medium text-muted-foreground"
                              aria-hidden="true"
                            >
                              ?
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span
                                className="max-w-56 truncate text-sm font-semibold"
                                title={a.full_name}
                              >
                                {a.full_name || "No name set"}
                              </span>
                              {isYou ? (
                                <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                  You
                                </span>
                              ) : null}
                              {incomplete ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                  Incomplete profile
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                              ID {a.id_number}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span
                          className={
                            a.designation
                              ? "block truncate text-sm"
                              : "block truncate text-sm text-muted-foreground"
                          }
                          title={a.designation}
                        >
                          {a.designation || "Not assigned"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        {a.position ? (
                          <>
                            <span
                              className="block truncate text-sm font-semibold"
                              title={a.position}
                            >
                              {a.position}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {shownDepartment || "Department not set"}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span
                          className={
                            a.role === "admin"
                              ? "inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                              : "inline-flex items-center rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
                          }
                        >
                          {roleText(a.role)}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3.5 align-middle text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                        title={new Date(a.created_at).toLocaleString()}
                      >
                        {relativeTime(a.created_at)}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={`Edit ${a.id_number}`}
                            title="Edit"
                            onClick={() => setEditing({ ...a, role: a.role as Role })}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </button>
                          {isYou ? null : (
                            <button
                              type="button"
                              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
          </div>
        )}

        {/* Phones: one card per account, the columns stacked underneath. No
            sideways scrolling to reach the edit buttons, and long names wrap
            instead of being cut off. Same content, same actions. */}
        {!isLoading && list.length > 0 ? (
          <div className="mt-3 space-y-2 md:hidden">
            {list.map((a) => {
              const isYou = a.id === session?.id;
              const incomplete = isIncomplete(a);
              const shownDepartment = displayDepartment(a);
              return (
                <div key={a.id} className="rounded-lg border p-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    {a.full_name ? (
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
                        aria-hidden="true"
                      >
                        {initialsOf(a.full_name)}
                      </span>
                    ) : (
                      <span
                        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed bg-muted text-xs font-medium text-muted-foreground"
                        aria-hidden="true"
                      >
                        ?
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {a.full_name || "No name set"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        ID {a.id_number}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Edit ${a.id_number}`}
                        title="Edit"
                        onClick={() => setEditing({ ...a, role: a.role as Role })}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </button>
                      {isYou ? null : (
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove ${a.id_number}`}
                          title="Remove"
                          onClick={() => setRemoving({ ...a, role: a.role as Role })}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={
                        a.role === "admin"
                          ? "inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                          : "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                      }
                    >
                      {roleText(a.role)}
                    </span>
                    {isYou ? (
                      <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        You
                      </span>
                    ) : null}
                    {incomplete ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        Incomplete profile
                      </span>
                    ) : null}
                    <span
                      className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground tabular-nums"
                      title={new Date(a.created_at).toLocaleString()}
                    >
                      {relativeTime(a.created_at)}
                    </span>
                  </div>

                  <dl className="mt-2 space-y-0.5 text-xs">
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">Designation</dt>
                      <dd
                        className={`min-w-0 truncate ${a.designation ? "" : "text-muted-foreground"}`}
                      >
                        {a.designation || "Not assigned"}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">Position</dt>
                      <dd
                        className={`min-w-0 truncate ${a.position ? "font-medium" : "text-muted-foreground"}`}
                      >
                        {a.position || "Not assigned"}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-20 shrink-0 text-muted-foreground">Department</dt>
                      <dd
                        className={`min-w-0 truncate ${
                          shownDepartment ? "" : "text-muted-foreground"
                        }`}
                      >
                        {shownDepartment || "Not set"}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {list.length} of {totals.accounts} accounts
        </span>
        <span className="hidden sm:inline">
          Incomplete profiles are missing a name, designation, position or department.
        </span>
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
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  // Set by the pickers themselves: "Others…" is selected but nothing typed.
  const [designationInvalid, setDesignationInvalid] = useState(false);
  const [departmentInvalid, setDepartmentInvalid] = useState(false);
  const [positionInvalid, setPositionInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Which list-maintenance dialog (if any) a row's own button just opened. */
  const [orgRequest, setOrgRequest] = useState<OrgActionRequest | null>(null);

  // Re-seed the form whenever a different account (or "new") is opened.
  const openKey = editing === null ? null : isNew ? "new" : (account?.id ?? null);
  const [openId, setOpenId] = useState<string | null>(null);
  if (openKey && openKey !== openId) {
    setOpenId(openKey);
    setIdNumber(isNew ? "" : (account?.id_number ?? ""));
    setRole(isNew ? "user" : (account?.role ?? "user"));
    setPassword("");
    setDesignation(isNew ? "" : (account?.designation ?? ""));
    // A stored department wins; an older row falls back to the one its
    // position implies until someone picks one outright.
    setDepartment(
      isNew ? "" : account?.department || departmentForPosition(account?.position ?? ""),
    );
    setPosition(isNew ? "" : (account?.position ?? ""));
  }

  // The Position picker only offers what fits under the chosen Department —
  // a Position lives under exactly one Department, so the pair is the unit.
  // Both lists come from the editable org options table (falling back to the
  // fixed constants when the migration hasn't run), so a renamed item shows up
  // here without a code change.
  const { data: orgLists } = useQuery({ ...orgOptionsQueryOptions(), enabled: editing !== null });
  const baseDepartments = orgLists?.departments ?? DEPARTMENTS;
  const designationOptions = orgLists?.designations ?? DESIGNATIONS;
  const positionList = positionsUnder(department, orgLists);
  // The department picker has to be able to SHOW the department the picked
  // position implies, even when that department isn't on the shared list yet
  // (an older position whose department was never added). Without this the
  // picker would report a perfectly correct value as "Others" and open the
  // text box over it.
  const impliedDepartment = departmentForPosition(position);
  const departmentOptions =
    impliedDepartment && !baseDepartments.includes(impliedDepartment)
      ? [...baseDepartments, impliedDepartment]
      : baseDepartments;

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
    // An admin clearing these would blank the employee's Designation /
    // Department / Position and silently change which app-access rules match them.
    if (designationInvalid) {
      toast.error("Please specify the designation, or pick one from the list.");
      return;
    }
    if (departmentInvalid) {
      toast.error("Please specify the department, or pick one from the list.");
      return;
    }
    if (positionInvalid) {
      toast.error("Please specify the position, or pick one from the list.");
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
          // No label is sent either way: the service keeps the sidebar label
          // as-is (the real name comes from the employee's profile).
          password: password || undefined,
          // Blank leaves the employee's own value alone rather than clearing it,
          // so an admin who only meant to change the role can't wipe the
          // designation the employee typed under "My Account". The employee can
          // still change these themselves — the profile is shared.
          ...(designation.trim() ? { designation: designation.trim() } : {}),
          ...(department.trim() ? { department: department.trim() } : {}),
          ...(position.trim() ? { position: position.trim() } : {}),
          ...(account ? { id: account.id } : {}),
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
    <>
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
              placeholder="e.g. 2026-XXX"
            />
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
            <OrgSelect
              id="account-designation"
              label="Designation"
              list={designationOptions}
              value={designation}
              placeholder="e.g. RGC Dipolog Satellite"
              onChange={(v) => setDesignation(normalizeDesignation(v))}
              onValidityChange={setDesignationInvalid}
              actions={{
                onAdd: () => setOrgRequest({ kind: "designation", mode: "add" }),
                onRename: (value) => setOrgRequest({ kind: "designation", mode: "rename", value }),
                onDelete: (value) => setOrgRequest({ kind: "designation", mode: "delete", value }),
              }}
            />
            <OrgSelect
              id="account-department"
              label="Department"
              list={departmentOptions}
              value={department}
              placeholder="e.g. Information Technology"
              onChange={(v) => {
                setDepartment(v);
                // A Position lives under exactly one Department — if the one
                // already picked doesn't belong here, clear it rather than save
                // an impossible pair.
                if (position && !positionsUnder(v, orgLists).includes(position)) setPosition("");
              }}
              onValidityChange={setDepartmentInvalid}
              // Each row carries its own rename / trash; the panel ends with Add.
              actions={{
                onAdd: () => setOrgRequest({ kind: "department", mode: "add" }),
                onRename: (value) => setOrgRequest({ kind: "department", mode: "rename", value }),
                onDelete: (value) => setOrgRequest({ kind: "department", mode: "delete", value }),
              }}
            />
            <OrgSelect
              id="account-position"
              label="Position"
              list={positionList}
              value={position}
              placeholder={department ? "Pick a position in this department" : "e.g. IT Support"}
              onChange={(v) => {
                const next = normalizePosition(v);
                setPosition(next);
                // The department follows the position, the same way "HR
                // Officer" implies the HR department — so it is always
                // overwritten rather than only filling an empty field. That
                // also repairs an older row whose department was never stored.
                const implied = departmentForPosition(next);
                if (implied) setDepartment(implied);
              }}
              onValidityChange={setPositionInvalid}
              actions={{
                onAdd: () => setOrgRequest({ kind: "position", mode: "add" }),
                onRename: (value) => setOrgRequest({ kind: "position", mode: "rename", value }),
                onDelete: (value) => setOrgRequest({ kind: "position", mode: "delete", value }),
              }}
            />
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

      {/* The rename / add / delete dialogs behind each row's own buttons. */}
      <OrgOptionDialogs
        request={orgRequest}
        department={department}
        onClose={() => setOrgRequest(null)}
        onRenamed={(kind, next) => {
          if (kind === "designation") setDesignation(next);
          else if (kind === "department") setDepartment(next);
          else setPosition(next);
        }}
        onDeleted={(kind) => {
          // The value is gone from the list, so drop it from the form too —
          // otherwise saving would put the deleted name straight back on the
          // profile. A deleted department takes its positions' pairing with it.
          if (kind === "designation") {
            setDesignation("");
          } else if (kind === "department") {
            setDepartment("");
            setPosition("");
          } else {
            setPosition("");
          }
        }}
        onAdded={(kind) => {
          if (kind === "designation") setDesignationInvalid(false);
          else if (kind === "department") setDepartmentInvalid(false);
          else setPositionInvalid(false);
        }}
      />
    </>
  );
}
