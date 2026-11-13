import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { deleteCode, upsertCode } from "@/api/access-codes.functions";
import { ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { TextField } from "@/components/common/FormField";
import { OrgSelect } from "@/components/common/OrgSelect";
import { PageTitle } from "@/components/common/PageTitle";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { OrgOptionDialogs, type OrgActionRequest } from "./OrgOptionDialogs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { sessionQueryOptions } from "@/features/auth/queries";
import { profileQueryOptions } from "@/features/profile/queries";
import { toast } from "@/lib/toast";
import { relativeTime } from "@swiftslip/shared/time";
import {
  departmentForPosition,
  EMPLOYER_LABELS,
  employerCode,
  employerLabel,
  normalizeDesignation,
  normalizePosition,
  positionsUnder,
  type Employer,
  type OrgLists,
} from "@swiftslip/shared/org";

import type { Role } from "@swiftslip/shared/types";
import { accessCodesQueryOptions, orgOptionsQueryOptions } from "../queries";
import { useUserPhotos } from "../use-user-photos";
import { PASSWORD_MIN_LENGTH } from "@swiftslip/shared/schemas";

type Account = {
  id: string;
  /** The employee's real full name, joined in from their profile ("" when unset). */
  full_name: string;
  /** Profile `area`, the office/branch, shown as Designation. */
  designation: string;
  /** Profile `department`, the org unit the position belongs to. */
  department: string;
  /** Profile `designation`, the job title. */
  position: string;
  /** Profile `employer`, the company the employee works for (0 = Regasco, 1 = Mindbridge). */
  employer: Employer;
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
 * The two access levels, each carrying the line that says what it can do. The
 * dialog draws these as radio buttons rather than a select, so nobody has to
 * pick "Administrator" without knowing that it is the one that can edit,
 * import and manage this list.
 */
const ACCESS_LEVELS: Array<{ value: Role; label: string; blurb: string }> = [
  {
    value: "admin",
    label: "Administrator",
    blurb: "Can edit records, import files and manage this list.",
  },
  { value: "user", label: "Staff", blurb: "Can view, print and download." },
];

/**
 * The department a row shows: the one stored on the profile, or the one its
 * position implies for rows that were never backfilled / predate migration
 * 0023, resolved against the live `org_positions` rows, never a built-in
 * copy. The office branch is never a department, so `designation` is not used.
 */
function displayDepartment(a: Account, lists?: OrgLists) {
  return a.department.trim() || departmentForPosition(a.position, lists);
}

/**
 * A profile is incomplete until it says who the person is and where they work:
 * the real name, the Designation (office), the Department, and the Position.
 * Anything less and the forms that auto-fill from the profile print blanks.
 */
function isIncomplete(a: Account, lists?: OrgLists) {
  return (
    !a.full_name.trim() ||
    !a.designation.trim() ||
    !displayDepartment(a, lists) ||
    !a.position.trim()
  );
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
 * Support and IT Programmer under Information Technology), both stored on the
 * profile, where a position implies its department until one is set. The Name
 * column shows the employee's real full name from their profile, the
 * free-text sidebar label is no longer edited here. (Same server functions as
 * the old "Access passwords" list.)
 */
export function UserManagement() {
  const { data: session } = useQuery(sessionQueryOptions());
  const qc = useQueryClient();
  const { data: accounts, isLoading } = useQuery(accessCodesQueryOptions());
  // The same org tables the pickers read, so a row whose department is blank
  // can still show the department its position is filed under.
  const { data: orgLists } = useQuery(orgOptionsQueryOptions());
  // Faces for the roster, same shared batch cache the other admin lists use,
  // so opening User management after App access costs no extra request.
  const photos = useUserPhotos((accounts ?? []).map((account) => account.id));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [removing, setRemoving] = useState<Account | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: accessCodesQueryOptions().queryKey });
    // The admin may have just edited their own account (employer, position,
    // name). Refresh the cached profile so the sidebar caption and every
    // employer-aware logo switch immediately instead of waiting out its
    // five-minute staleTime.
    void qc.invalidateQueries({ queryKey: profileQueryOptions().queryKey });
  };

  const all = accounts ?? [];
  const totals = {
    accounts: all.length,
    admins: all.filter((a) => a.role === "admin").length,
    staff: all.filter((a) => a.role === "user").length,
    incomplete: all.filter((a) => isIncomplete(a, orgLists)).length,
  };

  const query = search.trim().toLowerCase();
  const list = all.filter((a) => {
    const byChip =
      filter === "all"
        ? true
        : filter === "incomplete"
          ? isIncomplete(a, orgLists)
          : a.role === filter;
    if (!byChip) return false;
    if (!query) return true;
    // `displayDepartment` too: a row awaiting backfill still answers to the
    // department its position implies.
    return `${a.id_number} ${a.full_name} ${a.designation} ${a.department} ${a.position} ${employerLabel(
      a.employer,
    )} ${displayDepartment(a, orgLists)} ${roleText(a.role)} ${a.role}`
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

  /** The tab counts, the header no longer repeats them in separate cards. */
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <PageTitle as="h2">User management</PageTitle>
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

      {/* The tabs and the search each carry their own underline, and a separate
          rule below them opens the table. The counts live in the tabs, so the
          four summary cards are gone. */}
      <div className="mt-8">
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
                        ? "rounded-[3px] bg-logo/15 px-1.5 py-px text-[11px] font-semibold text-logo-ink"
                        : "text-xs font-normal text-muted-foreground"
                    }
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="order-first w-full sm:order-none sm:w-72">
            <div className="relative border-b border-input transition-colors focus-within:border-primary">
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

        <div className="mt-3 border-t" />

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
                ? `Nothing matches “${search.trim()}”. Try a different keyword, or switch the filter.`
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
                  const incomplete = isIncomplete(a, orgLists);
                  const shownDepartment = displayDepartment(a, orgLists);
                  return (
                    <tr key={a.id} className="border-b transition-colors hover:bg-muted/30">
                      <td className="py-5 pr-4 align-middle text-sm tabular-nums">{a.id_number}</td>
                      <td className="py-5 pr-4 align-middle">
                        <div className="flex items-center gap-3">
                          {a.full_name ? (
                            <ProfileAvatar
                              photo={photos[a.id]}
                              name={a.full_name}
                              size={40}
                              className="shrink-0"
                            />
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
                                <span className="rounded-[3px] bg-logo/15 px-1.5 py-0.5 text-[11px] font-semibold text-logo-ink">
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
                      <ProfileAvatar
                        photo={photos[a.id]}
                        name={a.full_name}
                        size={36}
                        className="shrink-0"
                      />
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
                        <span className="mt-1 inline-block rounded-[3px] bg-logo/15 px-1.5 py-0.5 text-[11px] font-semibold text-logo-ink">
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
                    <dt className="text-muted-foreground">Employer</dt>
                    <dd className="min-w-0 truncate">{employerLabel(a.employer)}</dd>
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

/** Create ("new") and edit share one dialog, same fields, same labels, same
 *  44px boxes and the same custom pickers, different wording underneath:
 *  "Create account" / "Save changes", a required password against one that may
 *  stay blank, and the ID number that only Create can be refused on (the red
 *  line and the caret return to the field it belongs to). */
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
  /** Under the ID box: "Enter the ID number." or the duplicate the API refused. */
  const [idError, setIdError] = useState<string | null>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [employer, setEmployer] = useState<Employer>(1);
  // Set by the pickers themselves: "Others…" is selected but nothing typed.
  const [designationInvalid, setDesignationInvalid] = useState(false);
  const [departmentInvalid, setDepartmentInvalid] = useState(false);
  const [positionInvalid, setPositionInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Which list-maintenance dialog (if any) a row's own button just opened. */
  const [orgRequest, setOrgRequest] = useState<OrgActionRequest | null>(null);

  // Re-seed the form whenever a different account (or "new") is opened.
  //
  // The org lists are read BEFORE that re-seed: the department an older row
  // implies is looked up in the live table, so seeding needs it.
  const { data: orgLists } = useQuery({ ...orgOptionsQueryOptions(), enabled: editing !== null });
  const openKey = editing === null ? null : isNew ? "new" : (account?.id ?? null);
  const [openId, setOpenId] = useState<string | null>(null);
  if (openKey && openKey !== openId) {
    setOpenId(openKey);
    setIdNumber(isNew ? "" : (account?.id_number ?? ""));
    // A refusal belongs to the account that was open before this one.
    setIdError(null);
    setRole(isNew ? "user" : (account?.role ?? "user"));
    setPassword("");
    setDesignation(isNew ? "" : (account?.designation ?? ""));
    // A stored department wins; an older row falls back to the one its
    // position implies until someone picks one outright.
    setDepartment(
      isNew ? "" : account?.department || departmentForPosition(account?.position ?? "", orgLists),
    );
    setPosition(isNew ? "" : (account?.position ?? ""));
    setEmployer(isNew ? 1 : (account?.employer ?? 1));
  }

  // The Position picker only offers what fits under the chosen Department,
  // a Position lives under exactly one Department, so the pair is the unit.
  // Both lists come straight from the editable org options table (no built-in
  // fallback copy), so a renamed item shows up here without a code change and
  // a deleted one stays gone.
  const baseDepartments = orgLists?.departments ?? [];
  const designationOptions = orgLists?.designations ?? [];
  const positionList = positionsUnder(department, orgLists);
  // The department picker has to be able to SHOW the department the picked
  // position implies, even when that department isn't on the shared list yet
  // (an older position whose department was never added). Without this the
  // picker would report a perfectly correct value as "Others" and open the
  // text box over it.
  const impliedDepartment = departmentForPosition(position, orgLists);
  const departmentOptions =
    impliedDepartment && !baseDepartments.includes(impliedDepartment)
      ? [...baseDepartments, impliedDepartment]
      : baseDepartments;

  /**
   * Return to the ID box with the caret at the END and nothing selected, the
   * spec's "the text is not selected, the cursor sits at the end". Programmed
   * focus is the only place that needs saying out loud: left to the browser it
   * can arrive as a full-width highlight, which is what made the old dialog
   * look as though it had pre-selected the number.
   */
  function focusId() {
    const el = idRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }

  async function save() {
    if (editing === null) return;
    if (!idNumber.trim()) {
      setIdError("Enter the ID number.");
      focusId();
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
    // A reset is what an admin types in a hurry. Refuse it here, with the same
    // short floor the server enforces, instead of letting the request fail
    // after the dialog has closed over it.
    if (password && password.length < PASSWORD_MIN_LENGTH) {
      toast.error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    try {
      await upsertCode({
        data: {
          idNumber: idNumber.trim(),
          role,
          // Create: the password is the account's first one (required above).
          // Edit: blank = keep the existing password, only rehash when given.
          // No label is sent either way: the service keeps the sidebar label
          // as-is (the real name comes from the employee's profile).
          password: password || undefined,
          // Blank leaves the employee's own value alone rather than clearing it,
          // so an admin who only meant to change the role can't wipe the
          // designation the employee typed under "My Account". The employee can
          // still change these themselves, the profile is shared.
          ...(designation.trim() ? { designation: designation.trim() } : {}),
          ...(department.trim() ? { department: department.trim() } : {}),
          ...(position.trim() ? { position: position.trim() } : {}),
          // Employer is always sent as its stored code (0 = Regasco,
          // 1 = Mindbridge); the picker itself speaks labels.
          employer,
          ...(account ? { id: account.id } : {}),
        },
      });
      toast.success(isNew ? "Account created" : "Account updated");
      onSaved();
    } catch (e) {
      // A duplicate ID is refused by the FIELD, so it is shown on the field:
      // red frame, one red line, caret back in the box to retype it. A toast
      // would say the same thing twice and could not point at the offender.
      if (e instanceof ApiError && e.code === "UNIQUE_FIELD_ERROR") {
        setIdError("This ID number is already in use.");
        focusId();
        return;
      }
      toast.error(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && !busy && onClose()}>
        <DialogContent
          // Radix already traps Tab inside the dialog and closes it on Esc,
          // what it does NOT get right is where the caret starts: it would put
          // it on the X in the corner. The dialog opens on its first field, so
          // the ID number can be typed straight away.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            focusId();
          }}
        >
          <DialogHeader>
            <DialogTitle>{isNew ? "Create account" : "Edit account"}</DialogTitle>
          </DialogHeader>

          {/* One form for both modes: Enter in any field saves, Tab walks the
              fields in the order they are drawn, and every box on the way is
              the same box. */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) void save();
            }}
          >
            <div className="space-y-4">
              <TextField
                label="ID number"
                value={idNumber}
                onChange={(next) => {
                  setIdNumber(next);
                  // The number that was refused is no longer the number shown.
                  if (idError) setIdError(null);
                }}
                placeholder="e.g. 2026-515"
                error={idError ?? undefined}
                inputRef={idRef}
              />

              {/* Access level is two radios, each carrying the line that says
                  what it can do, the select it replaces made nobody guess
                  what "Administrator" meant. Native inputs, so the arrow keys
                  move between the two exactly as a radio group should. */}
              <fieldset>
                <legend className="lbl">Access level</legend>
                <div className="mt-1 space-y-1">
                  {ACCESS_LEVELS.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-start gap-2.5 rounded-md py-1"
                    >
                      <input
                        type="radio"
                        name="account-access-level"
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                        checked={role === option.value}
                        onChange={() => setRole(option.value)}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] leading-5">{option.label}</span>
                        <span className="block text-xs text-muted-foreground">{option.blurb}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* The office and its department share one row; Position runs the
                  full width beneath them, as in the reference. */}
              <div className="grid gap-4 sm:grid-cols-2">
                <OrgSelect
                  id="account-designation"
                  label="Designation"
                  list={designationOptions}
                  value={designation}
                  placeholder="e.g. RGC Dipolog Satellite"
                  emptyLabel="Select a designation"
                  onChange={(v) => setDesignation(normalizeDesignation(v))}
                  onValidityChange={setDesignationInvalid}
                  actions={{
                    onAdd: () => setOrgRequest({ kind: "designation", mode: "add" }),
                    onRename: (value) =>
                      setOrgRequest({ kind: "designation", mode: "rename", value }),
                    onDelete: (value) =>
                      setOrgRequest({ kind: "designation", mode: "delete", value }),
                  }}
                />
                <OrgSelect
                  id="account-department"
                  label="Department"
                  list={departmentOptions}
                  value={department}
                  placeholder="e.g. Information Technology"
                  emptyLabel="Select a department"
                  onChange={(v) => {
                    setDepartment(v);
                    // A Position lives under exactly one Department, if the one
                    // already picked doesn't belong here, clear it rather than save
                    // an impossible pair.
                    if (position && !positionsUnder(v, orgLists).includes(position))
                      setPosition("");
                  }}
                  onValidityChange={setDepartmentInvalid}
                  // Each row carries its own rename / trash; the panel ends with Add.
                  actions={{
                    onAdd: () => setOrgRequest({ kind: "department", mode: "add" }),
                    onRename: (value) =>
                      setOrgRequest({ kind: "department", mode: "rename", value }),
                    onDelete: (value) =>
                      setOrgRequest({ kind: "department", mode: "delete", value }),
                  }}
                />
              </div>
              <OrgSelect
                id="account-position"
                label="Position"
                list={positionList}
                value={position}
                placeholder={department ? "Pick a position in this department" : "e.g. IT Support"}
                emptyLabel="Select a position"
                onChange={(v) => {
                  const next = normalizePosition(v);
                  setPosition(next);
                  // The department follows the position only when the current one
                  // can't hold it, a department the admin just picked by hand
                  // must stay picked, or choosing a position under "IT DEP"
                  // silently rewrote the department back to "Information
                  // Technology".
                  const implied = departmentForPosition(next, orgLists);
                  if (implied && !positionsUnder(department, orgLists).includes(next)) {
                    setDepartment(implied);
                  }
                }}
                onValidityChange={setPositionInvalid}
                actions={{
                  onAdd: () => setOrgRequest({ kind: "position", mode: "add" }),
                  onRename: (value) => setOrgRequest({ kind: "position", mode: "rename", value }),
                  onDelete: (value) => setOrgRequest({ kind: "position", mode: "delete", value }),
                }}
              />
              {/* Two fixed choices, not an admin-maintained list: the company
                  the person works for. The picker shows labels; the API gets
                  the 0/1 code through the shared converter. */}
              <OrgSelect
                id="account-employer"
                label="Employer"
                list={EMPLOYER_LABELS}
                value={employerLabel(employer)}
                placeholder="e.g. Regasco"
                emptyLabel="Select an employer"
                allowOthers={false}
                allowBlank={false}
                onChange={(label) => setEmployer(employerCode(label))}
              />
              {/* The same field as the ID box above it; only the wording of the
                  rule underneath differs between the two modes. */}
              <TextField
                label={isNew ? "Password" : "Reset password"}
                value={password}
                onChange={setPassword}
                type="password"
                placeholder={
                  isNew
                    ? `At least ${PASSWORD_MIN_LENGTH} characters`
                    : "Leave blank to keep the current password"
                }
                autoComplete="new-password"
                hint={
                  isNew
                    ? "They can change it after they sign in."
                    : "Only fill this in to give the person a new password."
                }
              />
            </div>

            <DialogFooter className="mt-5">
              <button
                type="button"
                className="btn btn-outline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                // The same green every other primary action in the app saves
                // with; in dark mode it lifts to the dashboard green so the ink
                // on top stays readable instead of turning cream-on-green.
                className="btn bg-success text-success-foreground hover:bg-success-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-dashboard-accent dark:text-primary-foreground dark:hover:bg-dashboard-accent/80"
                disabled={busy}
              >
                {busy
                  ? isNew
                    ? "Creating…"
                    : "Saving…"
                  : isNew
                    ? "Create account"
                    : "Save changes"}
              </button>
            </DialogFooter>
          </form>
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
          // The value is gone from the list, so drop it from the form too,
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
