import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";

import { createRecord, deleteRecord } from "@/api/records.functions";
import { templateQueryOptions } from "@/features/template/queries";
import { MONTHS, periodLabel, periodRange } from "@/shared/period";
import type { Period } from "@/shared/types";
import { recordsQueryOptions } from "../queries";

type RecordRow = {
  id: string;
  name: string;
  emp_no: string;
  month: number;
  year: number;
  period: string;
};

type Status = "upcoming" | "active" | "closing" | "closed";

export function RecordsList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: records } = useQuery(recordsQueryOptions());
  const { data: template } = useQuery(templateQueryOptions());
  const [busy, setBusy] = useState(false);

  async function newRecord() {
    setBusy(true);
    const now = new Date();
    const { id } = await createRecord({
      data: {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        period: (template?.default_period ?? "first_half") as Period,
      },
    });
    setBusy(false);
    navigate({ to: "/records/$id", params: { id } });
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this record?")) return;
    await deleteRecord({ data: { id } });
    qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey });
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Attendance</p>
          <h1 className="mt-1 text-4xl">Time records</h1>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={newRecord}>
          New record
        </button>
      </div>

      {records && records.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {records.map((r) => (
            <RecordCard
              key={r.id}
              record={r as RecordRow}
              onDelete={() => onDelete(r.id)}
            />
          ))}
        </div>
      ) : records ? (
        <div className="mt-8 rounded-xl border bg-card px-4 py-10 text-center text-muted-foreground">
          No records yet.
        </div>
      ) : null}
    </main>
  );
}

function RecordCard({
  record: r,
  onDelete,
}: {
  record: RecordRow;
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
      className="flex cursor-pointer gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
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

        <p className="mt-3 text-xs text-foreground">
          {MONTHS[r.month - 1]} {r.year} · {periodLabel(r.period as Period, r.month, r.year)}
        </p>
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
