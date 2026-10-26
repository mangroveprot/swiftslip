import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { deleteLoaForm } from "@/api/loa.functions";
import { ApprovedStamp } from "@/components/common/ApprovedStamp";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageTitle } from "@/components/common/PageTitle";
import { ListSkeleton } from "@/components/common/Skeletons";
import { profileQueryOptions } from "@/features/profile/queries";
import { newDraftId } from "@/lib/draft";
import { toast } from "@/lib/toast";
import { useNow } from "@/lib/use-now";
import { formatMonthDayYear } from "@/shared/period";
import { relativeTime } from "@/shared/time";
import { loaFormsQueryOptions } from "../queries";

type LoaRow = {
  id: string;
  employee_name: string;
  id_number: string;
  department: string;
  position: string;
  date_from: string | null;
  date_to: string | null;
  /** Certificate ticked — badges the card as Approved. */
  attachment_approved: boolean;
  updated_at: string;
};

export function LoaList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: forms } = useQuery(loaFormsQueryOptions());
  // Warm the profile while the list is on screen: a new form is built from it the
  // moment "New form" is pressed, so fetching it only then would put a skeleton in
  // front of the user for data we could already have had.
  useQuery(profileQueryOptions());
  const [pendingDelete, setPendingDelete] = useState<LoaRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const now = useNow();

  // A draft lives only in the browser, so there is nothing here to filter out —
  // the list shows exactly the forms that are in the database.
  const visible = forms ?? [];

  function newForm() {
    navigate({ to: "/leave-of-absence/$id", params: { id: newDraftId() } });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      await deleteLoaForm({ data: { id: pendingDelete.id } });
      await qc.invalidateQueries({ queryKey: loaFormsQueryOptions().queryKey });
      toast.success(`Deleted "${pendingDelete.employee_name || "Untitled form"}"`);
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that form.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle size="xl">Leave of Absence</PageTitle>
        </div>
        <button className="btn btn-primary" onClick={newForm}>
          New form
        </button>
      </div>

      {forms && visible.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((f, i) => (
            <LoaCard
              key={f.id}
              form={f as LoaRow}
              index={i}
              now={now}
              onDelete={() => setPendingDelete(f as LoaRow)}
            />
          ))}
        </div>
      ) : forms ? (
        <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="max-w-sm space-y-2">
            <p className="text-xl font-medium text-foreground">No forms yet</p>
            <p className="text-sm text-muted-foreground">
              File a Leave of Absence form to record time off and keep your leave balance accurate.
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={newForm}>
            <Plus className="size-4" aria-hidden="true" />
            Create your first form
          </button>
        </div>
      ) : (
        <ListSkeleton />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !deleteBusy && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.employee_name || "Untitled form"}"?`}
        description="This permanently removes the form. This can't be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </main>
  );
}

function LoaCard({
  form: f,
  index,
  now,
  onDelete,
}: {
  form: LoaRow;
  index: number;
  now: Date;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const inclusive =
    f.date_from && f.date_to
      ? `${formatMonthDayYear(f.date_from)} → ${formatMonthDayYear(f.date_to)}`
      : formatMonthDayYear(f.date_from);
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate({ to: "/leave-of-absence/$id", params: { id: f.id } })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate({ to: "/leave-of-absence/$id", params: { id: f.id } });
        }
      }}
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms`, animationFillMode: "both" }}
      className="relative flex min-h-36 cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`truncate text-sm font-medium ${f.employee_name ? "" : "italic text-muted-foreground"}`}
          >
            {f.employee_name || "Untitled form"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{f.id_number || "No ID number"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to="/leave-of-absence/$id"
            params={{ id: f.id }}
            onClick={(e) => e.stopPropagation()}
            className="btn btn-outline gap-1 px-2.5 py-1 text-xs"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Open
          </Link>
          <button
            className="btn gap-1 px-2.5 py-1 text-xs text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </button>
        </div>
      </div>

      {/* Approved forms get the seal, laid over the card's quiet bottom-right
          corner so it never sits on the department/inclusive-dates lines.
          Unapproved forms show nothing at all — same rule as the other lists.
          The min-height holds that corner open even when a record has fewer
          rows. */}
      {f.attachment_approved ? (
        <ApprovedStamp
          approved
          size="sm"
          className="pointer-events-none absolute right-2 bottom-2 z-10"
        />
      ) : null}

      <p className="text-xs text-foreground">
        {[f.department, f.position].filter(Boolean).join(" · ") || "No department / position"}
      </p>
      {inclusive ? (
        // The date range is the one line here long enough to run under the
        // seal; it wraps in the corner's gutter instead of printing through it.
        <p className="pr-14 text-xs text-muted-foreground">Inclusive dates: {inclusive}</p>
      ) : null}
      {f.updated_at ? (
        <p
          className="flex items-center gap-1 text-[11px] text-muted-foreground"
          title={new Date(f.updated_at).toLocaleString()}
        >
          <Clock className="size-3" aria-hidden="true" />
          Updated {relativeTime(f.updated_at, now)}
        </p>
      ) : null}
    </div>
  );
}
