/**
 * The fields the paper Official Business form cannot leave the employee's
 * hands without — the ones marked with a red asterisk, plus the signature.
 *
 * One list for both sides of the wire: the editor blocks the button and
 * highlights the empty cells, and the API re-checks the row it is about to
 * move to HR. A stale tab, a direct POST or a resubmit after a rejection
 * cannot skip what the sheet marks as required.
 *
 * Kept in `shared` because a second copy of the list is how the highlight, the
 * inline hints and the toast would start disagreeing about what "required"
 * means. Everything here is plain data + plain string functions — no browser
 * or server code.
 */
import type { ObEntry, ObForm } from "./types";

/** One empty required cell: a stable key for the highlight, plus its copy. */
export type ObRequiredField = {
  /** Form key, `entry:<idx>:<column>` for an itinerary cell, or `entries`. */
  key: string;
  /** What the paper sheet calls it — used by the API's suggestions. */
  label: string;
  /** Short, human name for the toast sentence (no "Stop 1 —" prefixes). */
  shortLabel: string;
  /** Plain-English instruction printed under the highlighted cell. */
  hint: string;
};

type RequiredSpec = { key: string; label: string; shortLabel: string; hint: string };

/** The header block, in the order the sheet prints it. */
const FORM_FIELDS: (RequiredSpec & { key: keyof ObForm })[] = [
  {
    key: "id_number",
    label: "ID number",
    shortLabel: "ID number",
    hint: "Add your employee ID number.",
  },
  {
    key: "employee_name",
    label: "Employee name",
    shortLabel: "Employee name",
    hint: "Enter your full name.",
  },
  {
    key: "department",
    label: "Department / location",
    shortLabel: "Department",
    hint: "Add your department or office.",
  },
  {
    key: "position",
    label: "Position",
    shortLabel: "Position",
    hint: "Add your position.",
  },
  {
    key: "date_filed",
    label: "Date filed",
    shortLabel: "Date filed",
    hint: "Select the date you filed this form.",
  },
  {
    key: "date_of_ob",
    label: "Date of OB",
    shortLabel: "Date of OB",
    hint: "Select the date of the OB.",
  },
  {
    key: "approved_by",
    label: "Approved by (supervisor / dept. head)",
    shortLabel: "Approved by",
    hint: "Add your supervisor or department head's name.",
  },
  {
    key: "employee_signature",
    label: "Employee signature",
    shortLabel: "Signature",
    hint: "Add your signature before sending this to HR.",
  },
];

/** The three cells every itinerary stop needs. Times stay optional. */
const ENTRY_FIELDS: (RequiredSpec & { key: keyof ObEntry })[] = [
  {
    key: "from_place",
    label: "From",
    shortLabel: "From",
    hint: "Where are you leaving from?",
  },
  {
    key: "to_place",
    label: "To",
    shortLabel: "To",
    hint: "Add at least one destination.",
  },
  {
    key: "purpose",
    label: "Purpose(s)",
    shortLabel: "Purpose(s)",
    hint: "Describe the purpose of this trip.",
  },
];

const NO_STOPS: RequiredSpec = {
  key: "entries",
  label: "Itinerary (add a stop)",
  shortLabel: "Itinerary",
  hint: "Add at least one stop to your itinerary.",
};

/** Every required cell that is still empty, in sheet order. */
export function obMissingRequiredFields(form: ObForm, entries: ObEntry[]): ObRequiredField[] {
  const missing: ObRequiredField[] = [];

  for (const field of FORM_FIELDS) {
    if (!String(form[field.key] ?? "").trim()) {
      missing.push({ ...field, key: field.key });
    }
  }

  // An itinerary with no stop at all is the same gap as an empty "From".
  if (!entries.length) missing.push({ ...NO_STOPS });
  for (const entry of entries) {
    for (const field of ENTRY_FIELDS) {
      if (!String(entry[field.key] ?? "").trim()) {
        missing.push({
          ...field,
          key: `entry:${entry.idx}:${field.key}`,
          label: `Stop ${entry.idx + 1} — ${field.label}`,
        });
      }
    }
  }

  return missing;
}

/** `key → plain-English instruction` for the red line under each empty cell. */
export function obRequiredHints(missing: ObRequiredField[]): Record<string, string> {
  return Object.fromEntries(missing.map((field) => [field.key, field.hint]));
}

/** The paper's long labels get their short, spoken name in the toast. */
const SHORT_BY_LABEL = new Map<string, string>([
  ...FORM_FIELDS.map((field) => [field.label, field.shortLabel] as const),
  ...ENTRY_FIELDS.map((field) => [field.label, field.shortLabel] as const),
  [NO_STOPS.label, NO_STOPS.shortLabel] as const,
]);

/** "Date of OB and Purpose(s)", not "Date of OB, Stop 1 — Purpose(s)". */
function joinNames(names: string[]): string {
  if (names.length === 0) return "the required fields";
  if (names.length === 1) return names[0] ?? "the required fields";
  if (names.length === 2) return `${names[0] ?? ""} and ${names[1] ?? ""}`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? "the required fields"}`;
}

/**
 * The friendly notice for a blocked submission. The old copy read like a
 * validation log ("Stop 1 — Purpose(s), and 3 more"), so the title now says
 * what did NOT happen and the sentence says what to do, in the words the
 * sheet itself uses.
 */
export function obRequiredToastFromLabels(labels: string[]): {
  title: string;
  description: string;
} {
  // API suggestions carry the stop number and the full paper label; the toast
  // needs neither.
  const names = [
    ...new Set(
      labels.map((raw) => {
        const clean = raw.replace(/^Stop \d+\s+[—-]\s*/, "").trim();
        return SHORT_BY_LABEL.get(raw) ?? SHORT_BY_LABEL.get(clean) ?? clean;
      }),
    ),
  ].filter(Boolean);
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  const list =
    rest > 0
      ? `${shown.join(", ")} and ${rest} other field${rest === 1 ? "" : "s"}`
      : joinNames(shown);
  return {
    title: "Not sent to HR yet",
    description: `Fill in ${list} first. ${names.length === 1 ? "It is" : "They are"} marked in the form.`,
  };
}

/** Same notice, built from the shared missing-field list on the web side. */
export function obRequiredToast(missing: ObRequiredField[]): {
  title: string;
  description: string;
} {
  return obRequiredToastFromLabels(missing.map((field) => field.shortLabel));
}

/**
 * The API's error message for a direct POST that skipped the editor's check.
 * Reuses the toast sentence so a stale tab never shows a different, more
 * technical explanation than the button click did.
 */
export function obRequiredMessage(missing: ObRequiredField[]): string {
  return obRequiredToast(missing).description;
}
