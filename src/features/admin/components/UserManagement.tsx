import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Search, ShieldCheck, Trash2 } from "lucide-react";
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

/** Which tab is selected above the list. */
type Filter = "all" | "admin" | "user" | "incomplete";

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
  // The role is stored as "user"; "Staff" is only what the screen calls it.
  { key: "user", label: "Staff" },
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

  /** The tab counts — the header no longer repeats them in separate cards. */
  const counts: Record<Filter, number> = {
    all: totals.accounts,
    admin: totals.admins,
    user: totals.staff,
    incomplete: totals.incomplete,
  };

  return (
    // Same shell as App access / Activity logs: the flat layout stays, but on
    // the white card the rest of the admin panel uses.
    <section className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold tracking-tight">User management</h2>
          <p className="mt-2 max-w-[30rem] text-sm leading-6 text-muted-foreground">
            Every account signs in with its own ID number and password. Administrators{" "}
            <ShieldCheck
              className="inline size-3.5 align-[-2px] text-foreground/80"
              aria-hidden="true"
            />{" "}
            can edit records, import files, and manage this list. Staff{" "}
            <Eye className="inline size-3.5 align-[-2px] text-foreground/80" aria-hidden="true" />{" "}
            can view, print, and download.
          </p>
        </div>
        <button className="btn btn-primary ml-auto shrink-0" onClick={() => setEditing("new")}>
          Create account
        </button>
      </div>

      {/* Tabs and search share one rule: the active tab's underline sits on it
          and the table's header row follows straight after. The counts live in
          the tabs, so the four summary cards are gone. */}
      <div className="mt-4">
        <div className="border-b">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-x-7">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                const count = counts[f.key];
                return (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f.key)}
                    className={`-mb-px flex items-baseline gap-2 border-b-2 pt-1 pb-3 text-sm transition-colors ${
                      active
                        ? "border-primary font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                    <span
                      className={
                        f.key === "incomplete" && count > 0
                          ? "rounded-[3px] bg-amber-200 px-1.5 text-[11px] font-medium text-amber-950"
                          : "text-xs font-normal text-muted-foreground"
                      }
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="order-first w-full pb-2 sm:order-none sm:w-72">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search ID, name, position, or department…"
                  className="h-9 border-0 bg-transparent pr-0 pl-8 shadow-none focus-visible:ring-0"
                  aria-label="Search accounts"
                />
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div aria-label="Loading accounts">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 border-b py-5">
                <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-28 animate-pulse rounded bg-muted/70" />
                </div>
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
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-28 py-3 pr-4 font-normal">ID</th>
                  <th className="py-3 pr-4 font-normal">Name and designation</th>
                  <th className="w-44 py-3 pr-4 font-normal">Position and department</th>
                  <th className="w-40 py-3 pr-4 font-normal">Access</th>
                  <th className="w-28 py-3 pr-4 font-normal">Created</th>
                  <th className="w-24 py-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => {
                  const isYou = a.id === session?.id;
                  const incomplete = isIncomplete(a);
                  const shownDepartment = displayDepartment(a);
                  return (
                    <tr key={a.id} className="border-b transition-colors hover:bg-muted/30">
                      <td className="py-5 pr-4 align-middle text-sm tabular-nums">{a.id_number}</td>
                      <td className="py-5 pr-4 align-middle">
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
                            <p className="flex items-baseline gap-2">
                              <span
                                className={`truncate text-sm font-semibold ${
                                  a.full_name ? "" : "font-normal italic text-muted-foreground"
                                }`}
                                title={a.full_name}
                              >
                                {a.full_name || "No name set"}
                              </span>
                              {isYou ? (
                                <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
                                  You
                                </span>
                              ) : null}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                              {a.designation ? (
                                <span
                                  className="truncate text-xs text-muted-foreground"
                                  title={a.designation}
                                >
                                  {a.designation}
                                </span>
                              ) : null}
                              {incomplete ? (
                                <span className="rounded-[3px] bg-amber-200 px-1.5 py-0.5 text-[11px] font-medium text-amber-950">
                                  Incomplete profile
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-5 pr-4 align-middle">
                        {a.position ? (
                          <>
                            <p className="truncate text-sm font-medium" title={a.position}>
                              {a.position}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {shownDepartment || "Department not set"}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Not assigned</p>
                        )}
                      </td>
                      <td className="py-5 pr-4 align-middle">
                        <span className="flex items-center gap-2 text-sm">
                          {a.role === "admin" ? (
                            <ShieldCheck
                              className="size-4 shrink-0 text-foreground/60"
                              aria-hidden="true"
                            />
                          ) : (
                            <Eye
                              className="size-4 shrink-0 text-foreground/60"
                              aria-hidden="true"
                            />
                          )}
                          {roleText(a.role)}
                        </span>
                      </td>
                      <td
                        className="py-5 pr-4 align-middle text-sm whitespace-nowrap text-muted-foreground tabular-nums"
                        title={new Date(a.created_at).toLocaleString()}
                      >
                        {relativeTime(a.created_at)}
                      </td>
                      <td className="py-5 align-middle">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={`Edit ${a.id_number}`}
                            title="Edit"
                            onClick={() => setEditing({ ...a, role: a.role as Role })}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </button>
                          {isYou ? null : (
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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

        {/* Phones: the same account, stacked. No sideways scrolling to reach
            the edit buttons, and long names wrap instead of being cut off. */}
        {!isLoading && list.length > 0 ? (
          <div className="md:hidden">
            {list.map((a) => {
              const isYou = a.id === session?.id;
              const incomplete = isIncomplete(a);
              const shownDepartment = displayDepartment(a);
              return (
                <div key={a.id} className="border-b py-4">
                  <div className="flex min-w-0 items-start gap-3">
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
                      <p className="flex items-baseline gap-2">
                        <span
                          className={`truncate text-sm font-semibold ${
                            a.full_name ? "" : "font-normal italic text-muted-foreground"
                          }`}
                        >
                          {a.full_name || "No name set"}
                        </span>
                        {isYou ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">You</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {a.id_number}
                      </p>
                      {incomplete ? (
                        <span className="mt-1 inline-block rounded-[3px] bg-amber-200 px-1.5 py-0.5 text-[11px] font-medium text-amber-950">
                          Incomplete profile
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Edit ${a.id_number}`}
                        title="Edit"
                        onClick={() => setEditing({ ...a, role: a.role as Role })}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </button>
                      {isYou ? null : (
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove ${a.id_number}`}
                          title="Remove"
                          onClick={() => setRemoving({ ...a, role: a.role as Role })}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  <dl className="mt-2 grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Designation</dt>
                    <dd
                      className={`min-w-0 truncate ${a.designation ? "" : "text-muted-foreground"}`}
                    >
                      {a.designation || "Not assigned"}
                    </dd>
                    <dt className="text-muted-foreground">Position</dt>
                    <dd
                      className={`min-w-0 truncate ${a.position ? "font-medium" : "text-muted-foreground"}`}
                    >
                      {a.position || "Not assigned"}
                    </dd>
                    <dt className="text-muted-foreground">Department</dt>
                    <dd
                      className={`min-w-0 truncate ${shownDepartment ? "" : "text-muted-foreground"}`}
                    >
                      {shownDepartment || "Not set"}
                    </dd>
                    <dt className="text-muted-foreground">Access</dt>
                    <dd className="flex items-center gap-1.5">
                      {a.role === "admin" ? (
                        <ShieldCheck
                          className="size-3.5 shrink-0 text-foreground/60"
                          aria-hidden="true"
                        />
                      ) : (
                        <Eye className="size-3.5 shrink-0 text-foreground/60" aria-hidden="true" />
                      )}
                      {roleText(a.role)}
                    </dd>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd
                      className="whitespace-nowrap text-muted-foreground tabular-nums"
                      title={new Date(a.created_at).toLocaleString()}
                    >
                      {relativeTime(a.created_at)}
                    </dd>
                  </dl>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {list.length} of {totals.accounts} accounts
        </span>
        <span className="hidden sm:inline">
          Incomplete profiles are missing a name, designation, position, or department.
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
