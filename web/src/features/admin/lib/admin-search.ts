import { ROSTER_FILTERS, type RosterFilter } from "./roster";

/** The Admin Panel's pages, in the order its sidebar lists them. */
export const ADMIN_SECTIONS = [
  "dashboard",
  "users",
  "access",
  "sessions",
  "logs",
  "retention",
  "storage",
  "backup",
] as const;

export type Section = (typeof ADMIN_SECTIONS)[number];

/**
 * Activity log tabs this panel can render. The API's filter also knows
 * `showrooms`, but the page has no tab for it, so an address-bar value the
 * screen cannot show is dropped rather than leaving URL and tab disagreeing.
 */
export const ACTIVITY_LOG_TAB_KEYS = [
  "signin",
  "signin-failed",
  "access",
  "accounts",
  "records",
] as const;
export type ActivityLogTab = (typeof ACTIVITY_LOG_TAB_KEYS)[number];

/** The two ways App access can be read. */
export const ACCESS_TABS = ["app", "person"] as const;
export type AccessTab = (typeof ACCESS_TABS)[number];

/**
 * Everything the Admin Panel keeps in its URL.
 *
 * `section` is the page; `filter` narrows Activity logs; `role` and `tab` are
 * the User management and App access tabs. Keeping them here means a refresh,
 * a copied link or a redirected Google Drive handshake all land on the same
 * screen. `backup` / `reason` / `account` are Google's return handshake, kept
 * so the toast can read them once before they are cleared.
 */
export type AdminSearch = {
  section?: Section;
  filter?: ActivityLogTab;
  role?: RosterFilter;
  tab?: AccessTab;
  backup?: string;
  reason?: string;
  account?: string;
};

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/** Validate the address bar, dropping anything this panel does not own. */
export function validateAdminSearch(search: Record<string, unknown>): AdminSearch {
  const next: AdminSearch = {};

  const section = search["section"];
  if (isOneOf(section, ADMIN_SECTIONS)) next.section = section;

  const filter = search["filter"];
  if (isOneOf(filter, ACTIVITY_LOG_TAB_KEYS)) next.filter = filter;

  const role = search["role"];
  if (isOneOf(role, ROSTER_FILTERS)) next.role = role;

  const tab = search["tab"];
  if (isOneOf(tab, ACCESS_TABS)) next.tab = tab;

  for (const key of ["backup", "reason", "account"] as const) {
    const value = search[key];
    if (typeof value === "string") next[key] = value;
  }

  return next;
}
