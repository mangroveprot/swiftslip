import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Building2,
  Check,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  deleteAccessRule,
  getAccessOverview,
  setAccessRule,
  setAppDefault,
} from "@/api/access-rules.functions";
import { PageTitle } from "@/components/common/PageTitle";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { GRANTABLE_APP_KEYS, type GrantableAppKey, type RuleScope } from "@swiftslip/shared/types";

const APP_LABELS: Record<GrantableAppKey, string> = {
  swiftslip: "SwiftSlip",
  inventory: "Inventory",
  ticketing: "Ticketing",
};

const SCOPE_LABELS: Record<RuleScope, string> = {
  user: "Person",
  department: "Department",
  position: "Position",
};

const PERSON_STATES = [
  { value: "follow", label: "Follow rules" },
  { value: "allow", label: "Allow" },
  { value: "block", label: "Block" },
] as const;

type PersonState = (typeof PERSON_STATES)[number]["value"];

type Overview = Awaited<ReturnType<typeof getAccessOverview>>;
type Person = Overview["people"][number];
type Rule = Overview["rules"][number];
type Outcome = Person["apps"][number];

function outcomeOf(person: Person, app: GrantableAppKey): Outcome | undefined {
  return person.apps[GRANTABLE_APP_KEYS.indexOf(app)];
}

function roleText(person: Person) {
  return person.isAdmin ? "Administrator" : "Staff";
}

/**
 * Why this person currently has or does not have the app. The outcome comes
 * from the server's `resolveAccess`, so this sentence can only describe what
 * the route guards actually do.
 */
function reasonFor(person: Person, app: GrantableAppKey) {
  const outcome = outcomeOf(person, app);
  if (!outcome) return "";
  if (outcome.admin) return "Administrator — every app is always open.";
  if (outcome.byScope === "user") {
    return outcome.allowed
      ? "Allowed by a rule on this person."
      : "Blocked by a rule on this person.";
  }
  if (outcome.byScope === "department") {
    return person.department
      ? `${outcome.allowed ? "Allowed" : "Blocked"} by a rule on the ${person.department} department.`
      : `${outcome.allowed ? "Allowed" : "Blocked"} by a department rule.`;
  }
  if (outcome.byScope === "position") {
    return person.position
      ? `${outcome.allowed ? "Allowed" : "Blocked"} by a rule on the ${person.position} position.`
      : `${outcome.allowed ? "Allowed" : "Blocked"} by a position rule.`;
  }
  return outcome.allowed ? "Allowed by the starting point." : "Not allowed by the starting point.";
}

/**
 * Who may open each application.
 *
 * Two ways in, because administrators ask two different questions: "who has
 * the Inventory?" (By app) and "what can this person open?" (By person). Both
 * read the same server-computed outcome, so the screen cannot disagree with
 * the guard that actually enforces access.
 *
 * Administrators bypass everything. Their rows are shown, marked, and never
 * offered a control that would silently do nothing.
 */
export function AppAccess() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"app" | "person">("app");
  const [appKey, setAppKey] = useState<GrantableAppKey>(GRANTABLE_APP_KEYS[0]);
  const [personId, setPersonId] = useState<string | null>(null);
  const [appSearch, setAppSearch] = useState("");
  const [personSearch, setPersonSearch] = useState("");
  const [showWho, setShowWho] = useState(false);
  const [addMode, setAddMode] = useState<"allow" | "block" | null>(null);

  const overview = useQuery({ queryKey: ["access-overview"], queryFn: () => getAccessOverview() });

  const refresh = () => qc.invalidateQueries({ queryKey: ["access-overview"] });

  const setRule = useMutation({
    mutationFn: setAccessRule,
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || "Could not save that change."),
  });
  const removeRule = useMutation({
    mutationFn: (vars: { id: string; message: string }) =>
      deleteAccessRule({ data: { id: vars.id } }),
    onSuccess: async (_result, vars) => {
      await refresh();
      // The row/list has updated by now, so the toast confirms a visible
      // change instead of racing it.
      toast.success(vars.message);
    },
    onError: (e: Error) => toast.error(e.message || "Could not remove that rule."),
  });
  const defaultMutation = useMutation({
    mutationFn: setAppDefault,
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message || "Could not change the starting point."),
  });

  const busy = setRule.isPending || removeRule.isPending || defaultMutation.isPending;

  const data = overview.data;
  const people = data?.people ?? [];
  const selectedPerson = people.find((p) => p.id === personId) ?? people[0] ?? null;

  const appTerm = appSearch.trim().toLowerCase();
  const visibleApps = GRANTABLE_APP_KEYS.filter(
    (app) => !appTerm || APP_LABELS[app].toLowerCase().includes(appTerm),
  );

  const personTerm = personSearch.trim().toLowerCase();
  const visiblePeople = people.filter((p) => {
    if (!personTerm) return true;
    return `${p.name} ${p.idNumber} ${p.department} ${p.position} ${roleText(p)}`
      .toLowerCase()
      .includes(personTerm);
  });

  const canOpen = (app: GrantableAppKey) =>
    people.filter((person) => outcomeOf(person, app)?.allowed).length;

  async function setPersonAccess(person: Person, app: GrantableAppKey, next: PersonState) {
    const outcome = outcomeOf(person, app);
    if (!outcome || outcome.admin) return;
    try {
      if (next === "follow") {
        // Back to inherited: remove this person's own rule entirely.
        if (outcome.byScope === "user" && outcome.ruleId) {
          await removeRule.mutateAsync({
            id: outcome.ruleId,
            message: `${person.name || person.idNumber} now follows the rules for ${APP_LABELS[app]}.`,
          });
        }
        return;
      }
      await setRule.mutateAsync({
        data: {
          app_key: app,
          scope: "user",
          scope_value: person.id,
          allow: next === "allow",
        },
      });
    } catch {
      // onError already surfaced it.
    }
  }

  async function chooseDefault(app: GrantableAppKey, allow: boolean) {
    if (!data || data.defaults[app] === allow) return;
    try {
      await defaultMutation.mutateAsync({ data: { app_key: app, allow } });
    } catch {
      // onError already surfaced it.
    }
  }

  async function addRule(scope: RuleScope, scopeValue: string) {
    if (!addMode) return;
    try {
      await setRule.mutateAsync({
        data: {
          app_key: appKey,
          scope,
          scope_value: scopeValue,
          allow: addMode === "allow",
        },
      });
      setAddMode(null);
    } catch {
      // Stay open so the admin can pick something else.
    }
  }

  function removeRuleFor(rule: Rule) {
    const person =
      rule.scope === "user" ? people.find((candidate) => candidate.id === rule.scope_value) : null;
    const target = person
      ? person.name || person.idNumber
      : rule.scope === "user"
        ? "the deleted account"
        : rule.scope_value;
    removeRule.mutate({
      id: rule.id,
      message: `Removed the ${APP_LABELS[rule.app_key]} ${rule.allow ? "allow" : "block"} rule for ${target}.`,
    });
  }

  const error = overview.error instanceof Error ? overview.error.message : null;

  return (
    <section className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="min-w-0">
        <PageTitle as="h2">App access</PageTitle>
        <p className="mt-2 max-w-[34rem] text-sm leading-6 text-muted-foreground">
          Decide who can open each app. Start from an app to see who has it, or start from a person
          to see everything they can open.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-7">
        {(
          [
            { key: "app", label: "By app" },
            { key: "person", label: "By person" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`border-b-2 pt-1 pb-3 text-sm transition-colors ${
              tab === item.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3 border-t" />

      {error ? (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      ) : overview.isLoading || !data ? (
        <AccessSkeleton />
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-0">
          <aside className="min-w-0 lg:pr-6">
            <div className="relative border-b border-input transition-colors focus-within:border-primary">
              <Search
                className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={tab === "app" ? appSearch : personSearch}
                onChange={(e) =>
                  tab === "app" ? setAppSearch(e.target.value) : setPersonSearch(e.target.value)
                }
                placeholder={
                  tab === "app" ? "Search apps" : "Search name, ID, position, or department…"
                }
                className="h-9 border-0 bg-transparent pr-0 pl-8 shadow-none focus-visible:ring-0"
                aria-label={tab === "app" ? "Search apps" : "Search people"}
              />
            </div>

            <div className="mt-1 max-h-[28rem] overflow-y-auto">
              {tab === "app" ? (
                visibleApps.length ? (
                  visibleApps.map((app) => {
                    const active = appKey === app;
                    return (
                      <button
                        key={app}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setAppKey(app);
                          setShowWho(false);
                        }}
                        className={`flex w-full flex-col gap-0.5 border-b px-3 py-3 text-left transition-colors ${
                          active ? "bg-primary/[0.06]" : "hover:bg-muted/40"
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className={`truncate text-sm ${active ? "font-semibold" : "font-medium"}`}
                          >
                            {APP_LABELS[app]}
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {canOpen(app)} of {people.length} can open
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-3 py-6 text-sm text-muted-foreground">No apps match.</p>
                )
              ) : visiblePeople.length ? (
                visiblePeople.map((person) => {
                  const active = selectedPerson?.id === person.id;
                  return (
                    <button
                      key={person.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPersonId(person.id)}
                      className={`flex w-full flex-col gap-0.5 border-b px-3 py-2.5 text-left transition-colors ${
                        active ? "bg-primary/[0.06]" : "hover:bg-muted/40"
                      }`}
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate text-sm ${
                            person.name
                              ? active
                                ? "font-semibold"
                                : "font-medium"
                              : "font-normal italic text-muted-foreground"
                          }`}
                        >
                          {person.name || "No name set"}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {roleText(person)}
                        </span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {person.idNumber}
                        {person.department ? ` · ${person.department}` : ""}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-6 text-sm text-muted-foreground">
                  {people.length ? "No people match." : "No accounts yet."}
                </p>
              )}
            </div>
          </aside>

          <div
            // key forces a remount on tab or selection change, replaying the
            // enter animation the same way InventoryLayout does on route change.
            key={tab === "app" ? `app:${appKey}` : `person:${selectedPerson?.id ?? "none"}`}
            className="min-w-0 lg:border-l lg:pl-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out"
          >
            {tab === "app" ? (
              <AppDetail
                app={appKey}
                people={people}
                rules={data.rules}
                defaultAllow={data.defaults[appKey]}
                showWho={showWho}
                busy={busy}
                removingId={
                  removeRule.isPending && removeRule.variables ? removeRule.variables.id : null
                }
                onToggleWho={() => setShowWho((value) => !value)}
                onDefault={(allow) => void chooseDefault(appKey, allow)}
                onRemove={removeRuleFor}
                onAdd={(mode) => setAddMode(mode)}
              />
            ) : selectedPerson ? (
              <PersonDetail
                person={selectedPerson}
                busy={busy}
                onSet={(app, next) => void setPersonAccess(selectedPerson, app, next)}
              />
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm font-medium">No accounts yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create an account in User management to give it access.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {addMode && data ? (
        <AddRuleDialog
          key={`${appKey}:${addMode}`}
          appKey={appKey}
          kind={addMode}
          people={data.people}
          departments={data.departments}
          positions={data.positions}
          rules={data.rules}
          busy={setRule.isPending}
          onClose={() => setAddMode(null)}
          onSubmit={(scope, value) => void addRule(scope, value)}
        />
      ) : null}
    </section>
  );
}

function AppDetail({
  app,
  people,
  rules,
  defaultAllow,
  showWho,
  busy,
  removingId,
  onToggleWho,
  onDefault,
  onRemove,
  onAdd,
}: {
  app: GrantableAppKey;
  people: Person[];
  rules: Rule[];
  defaultAllow: boolean;
  showWho: boolean;
  busy: boolean;
  removingId: string | null;
  onToggleWho: () => void;
  onDefault: (allow: boolean) => void;
  onRemove: (rule: Rule) => void;
  onAdd: (mode: "allow" | "block") => void;
}) {
  const can = people.filter((person) => outcomeOf(person, app)?.allowed).length;
  const appRules = rules.filter((rule) => rule.app_key === app);
  const allowed = appRules.filter((rule) => rule.allow);
  const blocked = appRules.filter((rule) => !rule.allow);

  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-tight">{APP_LABELS[app]}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {can} of {people.length} {people.length === 1 ? "person" : "people"} can open this app.
        {people.length ? (
          <>
            {" "}
            <button
              type="button"
              onClick={onToggleWho}
              className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            >
              {showWho ? "Hide list" : "See who"}
            </button>
          </>
        ) : null}
      </p>

      {showWho ? (
        <div
          key="who-list"
          className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out"
        >
          <WhoList app={app} people={people} />
        </div>
      ) : null}

      <section className="mt-6">
        <h4 className="text-sm font-semibold">Starting point</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          What a staff account gets before any rule on this app is applied.
        </p>
        <div className="mt-2 overflow-hidden rounded-lg border">
          {[
            {
              allow: true,
              title: "Everyone can open it",
              detail: "Staff see this app unless a rule blocks them.",
            },
            {
              allow: false,
              title: "No one can open it until allowed",
              detail: "Staff need an allow rule to see this app.",
            },
          ].map((option) => (
            <label
              key={String(option.allow)}
              className={`flex cursor-pointer items-start gap-3 border-b px-3 py-2.5 transition-colors last:border-b-0 ${
                defaultAllow === option.allow ? "bg-primary/[0.04]" : "hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name={`starting-point-${app}`}
                className="mt-0.5 accent-primary"
                checked={defaultAllow === option.allow}
                disabled={busy}
                onChange={() => onDefault(option.allow)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="block text-xs text-muted-foreground">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <RuleSection
        title="Always allowed"
        hint="These people, departments, or positions can open it even when the starting point is closed."
        rules={allowed}
        people={people}
        busy={busy}
        removingId={removingId}
        onRemove={onRemove}
        onAdd={() => onAdd("allow")}
      />
      <RuleSection
        title="Blocked"
        hint="These people, departments, or positions can't open it, even if the starting point is open."
        rules={blocked}
        people={people}
        busy={busy}
        removingId={removingId}
        onRemove={onRemove}
        onAdd={() => onAdd("block")}
      />

      <p className="mt-6 max-w-2xl border-t pt-3 text-xs leading-5 text-muted-foreground">
        Administrators always have every app and can&apos;t be limited here. When rules overlap, the
        narrowest wins: a person&apos;s own rule beats their department&apos;s, which beats their
        position&apos;s.
      </p>
    </div>
  );
}

function WhoList({ app, people }: { app: GrantableAppKey; people: Person[] }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border">
      {people.length ? (
        people.map((person) => {
          const outcome = outcomeOf(person, app);
          const allowed = Boolean(outcome?.allowed);
          return (
            <div
              key={person.id}
              className="flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0"
            >
              {person.isAdmin ? (
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : allowed ? (
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span
                    className={`truncate text-sm font-medium ${
                      person.name ? "" : "italic text-muted-foreground"
                    }`}
                  >
                    {person.name || "No name set"}
                  </span>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    {person.idNumber}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {reasonFor(person, app)}
                </p>
              </div>
            </div>
          );
        })
      ) : (
        <p className="px-3 py-4 text-sm text-muted-foreground">No accounts yet.</p>
      )}
    </div>
  );
}

function RuleSection({
  title,
  hint,
  rules,
  people,
  busy,
  removingId,
  onRemove,
  onAdd,
}: {
  title: string;
  hint: string;
  rules: Rule[];
  people: Person[];
  busy: boolean;
  removingId: string | null;
  onRemove: (rule: Rule) => void;
  onAdd: () => void;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        {rules.length ? (
          <span className="text-xs text-muted-foreground">{rules.length}</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>

      {rules.length ? (
        <div className="mt-2">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              people={people}
              busy={busy}
              removing={rule.id === removingId}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Nobody added yet.</p>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="mt-2 flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-input hover:bg-muted/40 hover:text-foreground"
      >
        <Plus className="size-4 shrink-0" aria-hidden="true" />
        Add a department, position, or person
      </button>
    </section>
  );
}

function RuleRow({
  rule,
  people,
  busy,
  removing,
  onRemove,
}: {
  rule: Rule;
  people: Person[];
  busy: boolean;
  removing: boolean;
  onRemove: (rule: Rule) => void;
}) {
  const person = rule.scope === "user" ? people.find((p) => p.id === rule.scope_value) : null;
  const removed = rule.scope === "user" && !person;
  const primary = person
    ? person.name || "No name set"
    : removed
      ? "Removed account"
      : rule.scope_value;
  const secondary = person
    ? `${person.idNumber} · ${SCOPE_LABELS[rule.scope]}`
    : removed
      ? "Person · no longer signed in"
      : SCOPE_LABELS[rule.scope];
  const Icon = rule.scope === "user" ? User : rule.scope === "department" ? Building2 : Briefcase;
  const noName = removed || (person ? !person.name : false);

  return (
    <div
      className={`flex items-center gap-3 border-b py-2.5 transition-opacity last:border-b-0 ${
        removing ? "opacity-60" : ""
      }`}
      aria-busy={removing}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${noName ? "italic text-muted-foreground" : ""}`}
        >
          {primary}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {removing ? "Removing…" : secondary}
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onRemove(rule)}
        aria-label={removing ? `Removing ${primary}` : `Remove ${primary}`}
        aria-busy={removing}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
      >
        {removing ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <X className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function PersonDetail({
  person,
  busy,
  onSet,
}: {
  person: Person;
  busy: boolean;
  onSet: (app: GrantableAppKey, next: PersonState) => void;
}) {
  const meta = [`ID ${person.idNumber}`, person.position, person.department]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-tight">
        {person.name || <span className="italic text-muted-foreground">No name set</span>}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
      {person.isAdmin ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground/70" aria-hidden="true" />
          <p>Administrator — every app is always open. Admin access can&apos;t be limited here.</p>
        </div>
      ) : (
        <p className="mt-2 max-w-[38rem] text-xs leading-5 text-muted-foreground">
          Follow rules uses the starting point and any department or position rules. Allow or Block
          overrides them for this person only.
        </p>
      )}

      <div className="mt-4 border-t">
        {GRANTABLE_APP_KEYS.map((app) => {
          const outcome = outcomeOf(person, app);
          if (!outcome) return null;
          const state: PersonState =
            outcome.byScope === "user" ? (outcome.allowed ? "allow" : "block") : "follow";
          return (
            <div
              key={app}
              className="flex flex-col gap-3 border-b py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {outcome.allowed ? (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <X className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span>
                    {APP_LABELS[app]}: {outcome.allowed ? "can open" : "can't open"}
                  </span>
                </p>
                <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                  {reasonFor(person, app)}
                </p>
              </div>

              {person.isAdmin ? (
                <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  Always
                </span>
              ) : (
                <div
                  role="radiogroup"
                  aria-label={`${APP_LABELS[app]} access for ${person.name || person.idNumber}`}
                  className="inline-flex w-fit shrink-0 rounded-md border bg-muted/30 p-0.5"
                >
                  {PERSON_STATES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={state === option.value}
                      disabled={busy}
                      onClick={() => onSet(app, option.value)}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                        state === option.value
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddRuleDialog({
  appKey,
  kind,
  people,
  departments,
  positions,
  rules,
  busy,
  onClose,
  onSubmit,
}: {
  appKey: GrantableAppKey;
  kind: "allow" | "block";
  people: Person[];
  departments: string[];
  positions: string[];
  rules: Rule[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (scope: RuleScope, value: string) => void;
}) {
  const [scope, setScope] = useState<RuleScope>("user");
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const appRules = rules.filter((rule) => rule.app_key === appKey);

  const rows =
    scope === "user"
      ? people
          .filter((person) => !person.isAdmin)
          .map((person) => ({
            value: person.id,
            label: person.name || "No name set",
            secondary: `${person.idNumber}${person.position ? ` · ${person.position}` : ""}`,
            search: `${person.name} ${person.idNumber} ${person.position} ${person.department}`,
          }))
      : (scope === "department" ? departments : positions).map((value) => {
          const count = people.filter(
            (person) => (scope === "department" ? person.department : person.position) === value,
          ).length;
          return {
            value,
            label: value,
            secondary: count ? `${count} ${count === 1 ? "person" : "people"}` : "No one currently",
            search: value,
          };
        });

  const query = term.trim().toLowerCase();
  const filtered = rows.filter((row) => !query || row.search.toLowerCase().includes(query));

  const isAlready = (value: string) =>
    appRules.some(
      (rule) =>
        rule.scope === scope && rule.scope_value === value && rule.allow === (kind === "allow"),
    );

  const currentState = (value: string) =>
    appRules.find((rule) => rule.scope === scope && rule.scope_value === value) ?? null;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {kind === "allow" ? "Allow access to" : "Block access to"} {APP_LABELS[appKey]}
          </DialogTitle>
          <DialogDescription>
            Pick a person, department, or position. The rule applies only to this app.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-0.5">
          {(["user", "department", "position"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => {
                setScope(value);
                setPicked(null);
                setTerm("");
              }}
              className={`flex-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                scope === value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {SCOPE_LABELS[value]}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={scope === "user" ? "Search name, ID, or position…" : `Search ${scope}s…`}
            className="pl-8"
            aria-label={`Search ${scope}s`}
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border">
          {filtered.length ? (
            filtered.map((row) => {
              const already = isAlready(row.value);
              const current = currentState(row.value);
              const active = picked === row.value;
              return (
                <button
                  key={row.value}
                  type="button"
                  disabled={already}
                  onClick={() => setPicked(row.value)}
                  className={`flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 ${
                    active ? "bg-primary/[0.06]" : "hover:bg-muted/40"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.secondary}
                    </span>
                  </span>
                  {already ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">Added</span>
                  ) : current ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {current.allow ? "Allowed" : "Blocked"}
                    </span>
                  ) : null}
                  {active ? (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {scope === "user" ? "No staff accounts match." : "Nothing matches."}
            </p>
          )}
        </div>

        <DialogFooter>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!picked || busy || isAlready(picked)}
            onClick={() => picked && onSubmit(scope, picked)}
          >
            {busy ? "Saving…" : kind === "allow" ? "Allow" : "Block"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccessSkeleton() {
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-0" aria-hidden="true">
      <div className="lg:pr-6">
        <div className="h-9 border-b bg-muted/40" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 border-b py-3">
            <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted/70" />
          </div>
        ))}
      </div>
      <div className="space-y-4 lg:border-l lg:pl-6">
        <div className="h-7 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted/70" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
