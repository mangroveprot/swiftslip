import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell, useMe } from "@/components/AppShell";
import { createRecord, deleteRecord, getTemplate, listRecords } from "@/lib/dtr.functions";
import { MONTHS, periodLabel, type Period } from "@/lib/dtr-shared";

export const Route = createFileRoute("/records/")({
  head: () => ({
    meta: [
      { title: "Time records — SwiftSlip" },
      { name: "description", content: "Browse, open and print saved Daily Time Records." },
      { property: "og:title", content: "Time records — SwiftSlip" },
      { property: "og:description", content: "Browse, open and print saved Daily Time Records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <RecordsPage />
    </AppShell>
  ),
});

function RecordsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: who, isFetched: sessionChecked } = useMe();
  const fetchList = useServerFn(listRecords);
  const fetchTemplate = useServerFn(getTemplate);
  const doCreate = useServerFn(createRecord);
  const doDelete = useServerFn(deleteRecord);
  const [busy, setBusy] = useState(false);

  const { data: records } = useQuery({
    queryKey: ["records"],
    queryFn: () => fetchList(),
    enabled: sessionChecked && Boolean(who),
    retry: false,
  });
  const { data: template } = useQuery({
    queryKey: ["template"],
    queryFn: () => fetchTemplate(),
    enabled: sessionChecked && Boolean(who),
    retry: false,
  });

  const now = new Date();

  async function newRecord() {
    setBusy(true);
    const { id } = await doCreate({
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
        {who ? (
          <button className="btn btn-primary" disabled={busy} onClick={newRecord}>
            New record
          </button>
        ) : null}
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
                  {MONTHS[r.month - 1]} {r.year} · {periodLabel(r.period as Period, r.month, r.year)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to="/records/$id" params={{ id: r.id }} className="text-primary underline-offset-4 hover:underline">
                    Open
                  </Link>
                  {who?.role === "admin" ? (
                    <button
                      className="ml-4 text-destructive"
                      onClick={async () => {
                        if (!confirm("Delete this record?")) return;
                        await doDelete({ data: { id: r.id } });
                        qc.invalidateQueries({ queryKey: ["records"] });
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
