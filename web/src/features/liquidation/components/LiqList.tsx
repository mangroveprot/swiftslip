import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { deleteLiqForm } from "@/api/liquidation.functions";
import { ApprovedStamp } from "@/components/common/ApprovedStamp";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { DeletionNotice } from "@/components/common/DeletionNotice";
import { PageTitle } from "@/components/common/PageTitle";
import { ListSkeleton } from "@/components/common/Skeletons";
import { profileQueryOptions } from "@/features/profile/queries";
import { newDraftId } from "@/lib/draft";
import { toast } from "@/lib/toast";
import { useNow } from "@/lib/use-now";
import { liqDate, liqMoney } from "@swiftslip/shared/liq";
import { relativeTime } from "@swiftslip/shared/time";
import { liqFormsQueryOptions } from "../queries";

type LiqRow = {
  id: string;
  department: string;
  section_location: string;
  prepared_by: string;
  date_prepared: string;
  trip_to: string;
  purpose: string;
  currency: string;
  /** Approval slip ticked — the card shows the Approved seal. */
  attachment_approved: boolean;
  grand_total: number;
  updated_at: string;
  /** Set when a retention cleanup would take this form within a week. */
  deletes_in_days?: number;
};

export function LiqList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: forms } = useQuery(liqFormsQueryOptions());
  // Warm the profile while the list is on screen: a new form is built from it
  // the moment "New form" is pressed.
  useQuery(profileQueryOptions());
  const [pendingDelete, setPendingDelete] = useState<LiqRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const now = useNow();

  const visible = forms ?? [];

  function newForm() {
    navigate({ to: "/liquidation/$id", params: { id: newDraftId() } });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      await deleteLiqForm({ data: { id: pendingDelete.id } });
      await qc.invalidateQueries({ queryKey: liqFormsQueryOptions().queryKey });
      toast.success(`Deleted "${pendingDelete.prepared_by || "Untitled form"}"`);
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
          <PageTitle size="xl">Statement of Liquidation</PageTitle>
        </div>
        <button className="btn btn-primary" onClick={newForm}>
          New form
        </button>
      </div>

      {forms && visible.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((f, i) => (
            <LiqCard
              key={f.id}
              form={f as LiqRow}
              index={i}
              now={now}
              onDelete={() => setPendingDelete(f as LiqRow)}
            />
          ))}
        </div>
      ) : forms ? (
        <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="max-w-sm space-y-2">
            <p className="text-xl font-medium text-foreground">No forms yet</p>
            <p className="text-sm text-muted-foreground">
              File a Statement of Liquidation to list the expenses of a trip and total them for
              reimbursement.
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
        title={`Delete "${pendingDelete?.prepared_by || "Untitled form"}"?`}
        description="This permanently removes the form. This can't be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </main>
  );
}

function LiqCard({
  form: f,
  index,
  now,
  onDelete,
}: {
  form: LiqRow;
  index: number;
  now: Date;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate({ to: "/liquidation/$id", params: { id: f.id } })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate({ to: "/liquidation/$id", params: { id: f.id } });
        }
      }}
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms`, animationFillMode: "both" }}
      className="relative flex min-h-36 cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`truncate text-sm font-medium ${f.prepared_by ? "" : "italic text-muted-foreground"}`}
          >
            {f.prepared_by || "Untitled form"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[f.section_location, f.department].filter(Boolean).join(" · ") ||
              "No section / department"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to="/liquidation/$id"
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

      <p className="line-clamp-2 text-xs text-foreground">
        {f.trip_to || f.purpose || "No trip or purpose"}
      </p>
      {f.purpose && f.trip_to ? (
        <p className="line-clamp-1 text-xs text-muted-foreground">{f.purpose}</p>
      ) : null}

      <p className="text-sm font-medium text-foreground">
        {f.currency === "DOLLARS" ? "USD" : "PHP"} {liqMoney(f.grand_total) || "0.00"}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {f.date_prepared ? `Prepared ${liqDate(f.date_prepared)}` : "No date prepared"}
        </span>
      </p>

      <DeletionNotice days={f.deletes_in_days} />
      {f.updated_at ? (
        <p
          className="flex items-center gap-1 text-[11px] text-muted-foreground"
          title={new Date(f.updated_at).toLocaleString()}
        >
          <Clock className="size-3" aria-hidden="true" />
          Updated {relativeTime(f.updated_at, now)}
        </p>
      ) : null}

      {/* Same seal as the OB / LOA / COS / OT cards: an approved slip lays it
          over the quiet bottom-right corner, and an unapproved form shows
          nothing at all. */}
      {f.attachment_approved ? (
        <ApprovedStamp
          approved
          size="sm"
          className="pointer-events-none absolute right-2 bottom-2 z-10"
        />
      ) : null}
    </div>
  );
}
