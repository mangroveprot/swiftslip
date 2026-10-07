import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";

import { createRecord, deleteRecord } from "@/api/records.functions";
import { ApprovedBadge } from "@/components/common/ApprovedBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ListSkeleton } from "@/components/common/Skeletons";
import { DTR_TEMPLATE } from "@/shared/dtr-template";
import { toast } from "@/lib/toast";
import { useNow } from "@/lib/use-now";
import { MONTHS, periodLabel, periodRange } from "@/shared/period";
import { relativeTime } from "@/shared/time";
import type { Period } from "@/shared/types";
import { usePendingRecords } from "../lib/pending-records";
import { recordsQueryOptions } from "../queries";

type RecordRow = {
  id: string;
  name: string;
  emp_no: string;
  month: number;
  year: number;
  period: string;
  /** A DTR counts as approved once a file is attached (no approval flag). */
  attachment_path: string | null;
  updated_at: string;
};

type Status = "upcoming" | "active" | "closing" | "closed";

export function RecordsList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: records } = useQuery(recordsQueryOptions());
  // Auto-created records the user hasn't touched yet stay hidden until they are
  // filled in or cleaned up in the background — they are not real entries.
  const { pendingIds, markPending } = usePendingRecords();
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<RecordRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const now = useNow();

  const visible = (records ?? []).filter((r) => !pendingIds.has(r.id));

  async function newRecord() {
    setBusy(true);
    try {
      const today = new Date();
      const { id } = await createRecord({
        data: {
          month: today.getMonth() + 1,
          year: today.getFullYear(),
          period: DTR_TEMPLATE.default_period as Period,
        },
      });
      markPending(id);
      // Cached lists stay fresh for a while now, so mark this one stale before
      // leaving — it has to pick the new record up on the next visit.
      qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey, refetchType: "none" });
      navigate({ to: "/records/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create a new record.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      await deleteRecord({ data: { id: pendingDelete.id } });
      await qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey });
      toast.success(`Deleted "${pendingDelete.name || "Untitled record"}"`);
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that record.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Attendance</p>
          <h1 className="mt-1 text-4xl">Time records</h1>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={newRecord}>
          {busy ? "Creating…" : "New record"}
        </button>
      </div>

      {visible.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((r, i) => (
            <RecordCard
              key={r.id}
              record={r as RecordRow}
              index={i}
              now={now}
              onDelete={() => setPendingDelete(r as RecordRow)}
            />
          ))}
        </div>
      ) : records ? (
        <div className="mt-8 rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground">
          No records yet.
        </div>
      ) : (
        <ListSkeleton />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !deleteBusy && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name || "Untitled record"}"?`}
        description="This permanently removes the record and all its daily entries. This can't be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </main>
  );
}

function RecordCard({
  record: r,
  index,
  now,
  onDelete,
}: {
  record: RecordRow;
  index: number;
  now: Date;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const { start, end } = periodRange(r.period as Period, r.month, r.year);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === r.year && today.getMonth() + 1 === r.month;
  const todayDay = today.getDate();

  let status: Status = "closed";
  if (isCurrentMonth) {
    if (todayDay < start) status = "upcoming";
    else if (todayDay === end) status = "closing";
    else if (todayDay <= end) status = "active";
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate({ to: "/records/$id", params: { id: r.id } })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate({ to: "/records/$id", params: { id: r.id } });
        }
      }}
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms`, animationFillMode: "both" }}
      className="flex cursor-pointer gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={`truncate text-sm font-medium ${r.name ? "" : "italic text-muted-foreground"}`}
            >
              {r.name || "Untitled record"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{r.emp_no || "No employee no."}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              to="/records/$id"
              params={{ id: r.id }}
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

        {/* Attached file = approved on a DTR; records without one show nothing. */}
        {r.attachment_path ? <ApprovedBadge approved className="mt-2" /> : null}

        <p className="mt-3 text-xs text-foreground">
          {MONTHS[r.month - 1]} {r.year} · {periodLabel(r.period as Period, r.month, r.year)}
        </p>
        {r.updated_at ? (
          <p
            className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"
            title={new Date(r.updated_at).toLocaleString()}
          >
            <Clock className="size-3" aria-hidden="true" />
            Updated {relativeTime(r.updated_at, now)}
          </p>
        ) : null}
      </div>

      <RecordThumbnail status={status} hasName={Boolean(r.name)} />
    </div>
  );
}

/** Lightweight placeholder standing in for the DTR sheet — no per-record fetch. */
function RecordThumbnail({ status, hasName }: { status: Status; hasName: boolean }) {
  const tinted = (status === "active" || status === "closing") && hasName;
  return (
    <div className="h-[6.25rem] w-[4.75rem] shrink-0 rounded-sm border bg-paper p-1.5 shadow-sm">
      <div className={`h-1.5 rounded-sm ${tinted ? "bg-accent/35" : "bg-muted"}`} />
      <div className="mt-1.5 flex flex-col gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-0.5 rounded-full ${tinted && i < 3 ? "bg-accent/30" : "bg-muted"}`}
          />
        ))}
      </div>
    </div>
  );
}
