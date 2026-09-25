import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { createRecord, deleteRecord } from "@/api/records.functions";
import { useSession } from "@/features/auth/use-session";
import { templateQueryOptions } from "@/features/template/queries";
import { MONTHS, periodLabel } from "@/shared/period";
import type { Period } from "@/shared/types";
import { recordsQueryOptions } from "../queries";

export function RecordsList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const session = useSession();
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

      <div className="mt-8 overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Emp no.</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(records ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-3">{r.name || "Untitled record"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.emp_no || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {MONTHS[r.month - 1]} {r.year} ·{" "}
                  {periodLabel(r.period as Period, r.month, r.year)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to="/records/$id"
                    params={{ id: r.id }}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Open
                  </Link>
                  {session.role === "admin" ? (
                    <button
                      className="ml-4 text-destructive"
                      onClick={async () => {
                        if (!confirm("Delete this record?")) return;
                        await deleteRecord({ data: { id: r.id } });
                        qc.invalidateQueries({ queryKey: recordsQueryOptions().queryKey });
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {records && records.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  No records yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
