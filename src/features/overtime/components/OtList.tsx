import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";

import { createOtForm, deleteOtForm } from "@/api/ot.functions";
import { ApprovedBadge } from "@/components/common/ApprovedBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ListSkeleton } from "@/components/common/Skeletons";
import { toast } from "@/lib/toast";
import { useNow } from "@/lib/use-now";
import { relativeTime } from "@/shared/time";
import { usePendingForms } from "../lib/pending-forms";
import { otFormsQueryOptions } from "../queries";

type OtRow = {
  id: string;
  employee_name: string;
  id_number: string;
  department: string;
  position: string;
  date_filed: string;
  attachment_approved: boolean;
  updated_at: string;
};

export function OtList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: forms } = useQuery(otFormsQueryOptions());
  // Auto-created forms the user hasn't touched yet stay hidden until they are
  // filled in or cleaned up in the background — they are not real entries.
  const { pendingIds, markPending } = usePendingForms();
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<OtRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const now = useNow();

  const visible = (forms ?? []).filter((f) => !pendingIds.has(f.id));

  async function newForm() {
    setBusy(true);
    try {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const { id } = await createOtForm({ data: { date_filed: today } });
      markPending(id);
      qc.invalidateQueries({ queryKey: otFormsQueryOptions().queryKey, refetchType: "none" });
      navigate({ to: "/overtime/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create a new form.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      await deleteOtForm({ data: { id: pendingDelete.id } });
      await qc.invalidateQueries({ queryKey: otFormsQueryOptions().queryKey });
      toast.success(`Deleted "${pendingDelete.employee_name || "Untitled form"}"`);
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that form.");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Overtime</p>
          <h1 className="mt-1 text-4xl">Overtime forms</h1>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={newForm}>
          {busy ? "Creating…" : "New form"}
        </button>
      </div>

      {forms && visible.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((f, i) => (
            <OtCard
              key={f.id}
              form={f as OtRow}
              index={i}
              now={now}
              onDelete={() => setPendingDelete(f as OtRow)}
            />
          ))}
        </div>
      ) : forms ? (
        <div className="mt-8 rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground">
          No forms yet.
        </div>
      ) : (
        <ListSkeleton />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && !deleteBusy && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.employee_name || "Untitled form"}"?`}
        description="This permanently removes the form, its OT lines and its approval attachment. This can't be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDelete}
      />
    </main>
  );
}

function OtCard({
  form: f,
  index,
  now,
  onDelete,
}: {
  form: OtRow;
  index: number;
  now: Date;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate({ to: "/overtime/$id", params: { id: f.id } })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate({ to: "/overtime/$id", params: { id: f.id } });
        }
      }}
      style={{ animationDelay: `${Math.min(index, 12) * 55}ms`, animationFillMode: "both" }}
      className="flex cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500"
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
            to="/overtime/$id"
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

      {f.attachment_approved ? <ApprovedBadge approved /> : null}

      <p className="text-xs text-foreground">
        {[f.department, f.position].filter(Boolean).join(" · ") || "No department / position"}
      </p>
      {f.date_filed ? <p className="text-xs text-muted-foreground">Filed: {f.date_filed}</p> : null}
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
