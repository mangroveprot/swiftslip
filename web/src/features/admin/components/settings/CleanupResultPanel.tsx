import { useState } from "react";

import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  CleanupRunResult,
  RetentionFormItem,
  RetentionFormType,
} from "@swiftslip/shared/schemas";
import { formatDate } from "@swiftslip/shared/time";

import { FORM_TYPE_LABELS } from "./form-types";

/** Rows shown before the receipt collapses; the rest sit behind "Show all". */
const COLLAPSED_ROWS = 5;

const LINK =
  "rounded-sm text-xs font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

/** "1 day" / "3 days", same wording the rest of the page uses. */
const dayLabel = (days: number) => `${days} day${days === 1 ? "" : "s"}`;

const totalOf = (counts: Partial<Record<RetentionFormType, number>>) =>
  Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0);

const fileText = (files: number) => (files === 0 ? "no files" : plural(files, "file"));

/**
 * Settings → Data retention → the receipt after a run.
 *
 * The run already happened, so there is nothing to tick and nothing to
 * confirm: this only answers "what went, and why". The reason is the same for
 * every row (the keep period), so it is said once above the list instead of
 * repeated beside each form; the rows carry the parts that differ — the type,
 * the person, the date and how many files followed.
 *
 * Styled like the preview panel it replaces: success green, same box, one
 * screen, no dialog. The permanent record stays in "Last cleanup run".
 */
export function CleanupResultPanel({ result }: { result: CleanupRunResult }) {
  const [showAll, setShowAll] = useState(false);

  const forms = totalOf(result.formsDeleted);
  const files = totalOf(result.filesDeleted);
  const items = result.deleted;
  const shown = showAll ? items : items.slice(0, COLLAPSED_ROWS);
  const hidden = items.length - shown.length;

  return (
    <div className="mt-5 rounded-lg border border-dashboard-accent/25 bg-dashboard-soft/70 p-3.5 text-sm">
      <p className="font-medium">
        {plural(forms, "form")} and {plural(files, "file")} deleted.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Past the {dayLabel(result.days)} keep period, oldest first.
      </p>

      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No form was past the keep period when the run checked.
        </p>
      ) : (
        <>
          <ul className="mt-2.5 divide-y divide-dashboard-accent/15">
            {shown.map((item) => (
              <ResultRow key={`${item.type}:${item.id}`} item={item} />
            ))}
          </ul>

          {hidden > 0 || showAll ? (
            <button
              type="button"
              className={cn(LINK, "mt-2")}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show fewer" : `Show all ${items.length} forms`}
            </button>
          ) : null}
        </>
      )}

      {result.skipped > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Skipped {plural(result.skipped, "form")}: no longer past the cut-off when the run checked,
          so they were kept.
        </p>
      ) : null}

      {result.status !== "completed" ? (
        <p className="mt-2 text-xs font-medium text-destructive">
          Some files could not be removed from storage. They are orphaned now — the storage cleanup
          can collect them.
        </p>
      ) : null}
    </div>
  );
}

/** One deleted form: who, which type, when it was filed, what went with it. */
function ResultRow({ item }: { item: RetentionFormItem }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate">
        <span className="font-medium">{item.label}</span>
        <span className="text-muted-foreground">
          {" · "}
          {FORM_TYPE_LABELS[item.type]}
          {item.reference ? ` · ${item.reference}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {item.date ? formatDate(new Date(item.date)) : "no date"} · {fileText(item.files)}
      </span>
    </li>
  );
}
