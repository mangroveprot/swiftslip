import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell, useMe } from "@/components/AppShell";
import { DtrPreview } from "@/components/DtrPreview";
import { SignatureField } from "@/components/SignaturePad";
import { getRecord, getTemplate, importBiometricFile, listRecords, saveRecord } from "@/lib/dtr.functions";
import {
  MONTHS,
  PERIOD_LABELS,
  customPeriod,
  daysInMonth,
  daysForPeriod,
  formatShortDate,
  periodRange,
  type DtrEntry,
  type DtrHeader,
  type Period,
} from "@/lib/dtr-shared";
import { downloadDtrWord } from "@/lib/dtr-word-export";

export const Route = createFileRoute("/records/$id")({
  head: () => ({
    meta: [
      { title: "Daily Time Record sheet — SwiftSlip" },
      {
        name: "description",
        content:
          "Fill in the Daily Time Record, import biometric logs and preview the printed sheet live.",
      },
      { property: "og:title", content: "Daily Time Record sheet — SwiftSlip" },
      {
        property: "og:description",
        content:
          "Fill in the Daily Time Record, import biometric logs and preview the printed sheet live.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <RecordPage />
    </AppShell>
  ),
});

type NamedRecord = {
  id: string;
  name: string;
  emp_no: string;
  designation?: string;
  area?: string;
};

function RecordPage() {
  const { id } = useParams({ from: "/records/$id" });
  const { data: who, isFetched: sessionChecked } = useMe();
  const canEdit = Boolean(who);

  const fetchRecord = useServerFn(getRecord);
  const fetchTemplate = useServerFn(getTemplate);
  const fetchRecords = useServerFn(listRecords);
  const save = useServerFn(saveRecord);
  const doImport = useServerFn(importBiometricFile);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery({
    queryKey: ["record", id],
    queryFn: () => fetchRecord({ data: { id } }),
    enabled: sessionChecked && Boolean(who),
    retry: false,
  });
  const { data: template } = useQuery({
    queryKey: ["template"],
    queryFn: () => fetchTemplate(),
    enabled: sessionChecked && Boolean(who),
    retry: false,
  });
  const { data: allRecords } = useQuery({
    queryKey: ["records"],
    queryFn: () => fetchRecords(),
    enabled: sessionChecked && Boolean(who),
    retry: false,
  });

  const [header, setHeader] = useState<DtrHeader | null>(null);
  const [rows, setRows] = useState<Record<number, DtrEntry>>({});
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const employeeOptions = useMemo(() => {
    const map = new Map<string, NamedRecord>();
    for (const r of (allRecords ?? []) as NamedRecord[]) {
      const name = (r.name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, r);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allRecords]);

  useEffect(() => {
    if (!data) return;
    const r = data.record as DtrHeader & { id: string; employee_signature?: string };
    const localSig =
      typeof window !== "undefined" ? localStorage.getItem(`dtr-sig:${id}`) ?? "" : "";
    setHeader({
      emp_no: r.emp_no,
      name: r.name,
      designation: r.designation,
      area: r.area,
      month: r.month,
      year: r.year,
      period: r.period as Period,
      certified_by: r.certified_by,
      employee_signature: r.employee_signature || localSig || "",
    });
    const map: Record<number, DtrEntry> = {};
    for (const e of data.entries) map[e.day] = e;
    setRows(map);
  }, [data, id]);

  useEffect(() => {
    if (!header || typeof window === "undefined") return;
    if (header.employee_signature) localStorage.setItem(`dtr-sig:${id}`, header.employee_signature);
    else localStorage.removeItem(`dtr-sig:${id}`);
  }, [header?.employee_signature, id]);

  if (!header || !template)
    return <main className="p-10 text-sm text-muted-foreground">Loading sheet…</main>;

  const days = daysForPeriod(header.period, header.month, header.year);

  const row = (day: number): DtrEntry =>
    rows[day] ?? { day, time_in: "", time_out: "", schedule: "", remarks: "" };

  const setCell = (day: number, patch: Partial<DtrEntry>) =>
    setRows({ ...rows, [day]: { ...row(day), ...patch } });

  function pickEmployee(name: string) {
    const match = employeeOptions.find((e) => e.name === name);
    if (!match) {
      setHeader({ ...header!, name });
      return;
    }
    setHeader({
      ...header!,
      name: match.name,
      emp_no: match.emp_no || header!.emp_no,
      designation: match.designation || header!.designation,
      area: match.area || header!.area,
    });
  }

  async function onSave(next?: Record<number, DtrEntry>, nextHeader?: DtrHeader) {
    const h = nextHeader ?? header;
    if (!h) return;
    const source = next ?? rows;
    const entries = Object.values(source)
      .filter((e) => e.time_in || e.time_out || e.schedule || e.remarks)
      .sort((a, b) => a.day - b.day);
    setBusy(true);
    try {
      await save({ data: { id, header: h, entries } });
      setStatus("Saved");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    if (!header || !template) return;
    setBusy(true);
    setStatus("Reading the biometric record…");
    try {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes.at(i) ?? 0);
      const base64 = btoa(binary);
      const result = await doImport({
        data: { filename: file.name, mimeType: file.type || "application/pdf", base64 },
      });

      const nextHeader: DtrHeader = {
        ...header,
        emp_no: result.emp_no || header.emp_no,
        name: result.name || header.name,
      };
      const first = result.entries[0];
      if (!first) throw new Error("No time log rows were found in that file.");
      const imported = result.entries.filter(
        (entry) => entry.month === first.month && entry.year === first.year,
      );
      const importedDays = imported.map((entry) => entry.day);
      const startDay = Math.min(...importedDays);
      const endDay = Math.max(...importedDays);
      nextHeader.month = first.month;
      nextHeader.year = first.year;
      nextHeader.period = customPeriod(startDay, endDay, first.month, first.year);

      const next = { ...rows };
      for (const e of imported) {
        next[e.day] = {
          day: e.day,
          time_in: e.time_in,
          time_out: e.time_out,
          schedule: next[e.day]?.schedule ?? "",
          remarks: next[e.day]?.remarks ?? "",
        };
      }
      const matched = imported.length;
      setHeader(nextHeader);
      setRows(next);
      await onSave(next, nextHeader);
      setStatus(`Imported ${matched} day${matched === 1 ? "" : "s"}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function clearEntries() {
    setRows({});
    setStatus("Entries cleared");
    setTimeout(() => setStatus(""), 2000);
  }

  async function download() {
    if (!header || !template) return;
    setBusy(true);
    setStatus("Preparing Word file…");
    try {
      await downloadDtrWord({
        template,
        header,
        days,
        entryFor: row,
        fileName: `SwiftSlip_${header.name || "record"}_${MONTHS[header.month - 1]}_${header.year}.doc`,
      });
      setStatus("Word file downloaded");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Word download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-0 flex-col px-4 py-3 md:px-5 md:py-4 lg:h-full lg:overflow-hidden print:h-auto print:overflow-visible print:p-0">
      <div className="no-print mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Attendance
          </p>
          <h1 className="text-2xl font-semibold leading-tight">Daily Time Record</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <>
              <button
                className="btn btn-accent"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                Import from biometric record
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
              <button className="btn btn-primary" disabled={busy} onClick={() => onSave()}>
                Save
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-outline" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => download()}>
            Download Word
          </button>
          {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        <div className="no-print flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          <section className="shrink-0 rounded-xl border bg-card p-3 shadow-sm">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Field
                label="Emp No."
                value={header.emp_no}
                disabled={!canEdit}
                onChange={(v) => setHeader({ ...header, emp_no: v })}
              />
              <label className="block sm:col-span-1">
                <span className="lbl">Full name</span>
                <input
                  className="inp"
                  list="employee-name-options"
                  disabled={!canEdit}
                  value={header.name}
                  onChange={(e) => pickEmployee(e.target.value)}
                  placeholder="Select or type a name"
                />
                <datalist id="employee-name-options">
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.name} />
                  ))}
                </datalist>
              </label>
              <Field
                label="Designation"
                value={header.designation}
                disabled={!canEdit}
                onChange={(v) => setHeader({ ...header, designation: v })}
              />
              <Field
                label="Area"
                value={header.area}
                disabled={!canEdit}
                onChange={(v) => setHeader({ ...header, area: v })}
              />
              <label className="block">
                <span className="lbl">Month</span>
                <select
                  disabled={!canEdit}
                  value={header.month}
                  onChange={(e) => setHeader({ ...header, month: Number(e.target.value) })}
                  className="inp"
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="lbl">Year</span>
                <input
                  type="number"
                  disabled={!canEdit}
                  value={header.year}
                  onChange={(e) => setHeader({ ...header, year: Number(e.target.value) })}
                  className="inp"
                />
              </label>
              <label className="block">
                <span className="lbl">Days covered</span>
                <select
                  disabled={!canEdit}
                  value={header.period.startsWith("custom:") ? "custom" : header.period}
                  onChange={(e) => {
                    const value = e.target.value;
                    const currentRange = periodRange(header.period, header.month, header.year);
                    setHeader({
                      ...header,
                      period:
                        value === "custom"
                          ? customPeriod(
                              currentRange.start,
                              currentRange.end,
                              header.month,
                              header.year,
                            )
                          : (value as Period),
                    });
                  }}
                  className="inp"
                >
                  {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                  <option value="custom">Custom / imported range</option>
                </select>
              </label>
              <Field
                label={template.certified_by_label}
                value={header.certified_by}
                disabled={!canEdit}
                onChange={(v) => setHeader({ ...header, certified_by: v })}
              />
              {header.period.startsWith("custom:") ? (
                <RangeFields header={header} setHeader={setHeader} disabled={!canEdit} />
              ) : null}
            </div>

            <SignatureField
              value={header.employee_signature}
              disabled={!canEdit}
              onChange={(v) => setHeader({ ...header, employee_signature: v })}
            />
          </section>

          <section className="flex min-h-0 flex-col rounded-xl border bg-card p-3 shadow-sm lg:flex-1 lg:overflow-hidden">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Daily entries</h2>
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={clearEntries}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="min-h-0 lg:flex-1 lg:overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="w-20 py-1.5">Date</th>
                    <th className="py-1.5">{template.columns.in}</th>
                    <th className="py-1.5">{template.columns.out}</th>
                    <th className="py-1.5">{template.columns.schedule}</th>
                    <th className="py-1.5">{template.columns.remarks}</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const e = row(d);
                    return (
                      <tr key={d} className="border-t">
                        <td className="py-0.5 pr-2 text-xs text-muted-foreground">
                          {formatShortDate(d, header.month, header.year)}
                        </td>
                        <td className="py-0.5 pr-1.5">
                          <input
                            className="inp"
                            disabled={!canEdit}
                            value={e.time_in}
                            onChange={(ev) => setCell(d, { time_in: ev.target.value })}
                          />
                        </td>
                        <td className="py-0.5 pr-1.5">
                          <input
                            className="inp"
                            disabled={!canEdit}
                            value={e.time_out}
                            onChange={(ev) => setCell(d, { time_out: ev.target.value })}
                          />
                        </td>
                        <td className="py-0.5 pr-1.5">
                          <input
                            className="inp"
                            disabled={!canEdit}
                            value={e.schedule}
                            onChange={(ev) => setCell(d, { schedule: ev.target.value })}
                          />
                        </td>
                        <td className="py-0.5">
                          <input
                            className="inp"
                            disabled={!canEdit}
                            value={e.remarks}
                            onChange={(ev) => setCell(d, { remarks: ev.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="flex min-h-0 flex-col lg:overflow-hidden print:overflow-visible">
          <p className="no-print mb-1.5 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
            Live preview
          </p>
          <div className="min-h-0 rounded-sm lg:flex-1 lg:overflow-auto print:overflow-visible">
            <DtrPreview template={template} header={header} days={days} entryFor={row} />
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="lbl">{label}</span>
      <input
        className="inp"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function RangeFields({
  header,
  setHeader,
  disabled,
}: {
  header: DtrHeader;
  setHeader: (header: DtrHeader) => void;
  disabled: boolean;
}) {
  const range = periodRange(header.period, header.month, header.year);
  const lastDay = daysInMonth(header.month, header.year);
  return (
    <div className="grid grid-cols-2 gap-2 sm:col-span-2 xl:col-span-4">
      <label className="block">
        <span className="lbl">From day</span>
        <select
          className="inp"
          disabled={disabled}
          value={range.start}
          onChange={(e) =>
            setHeader({
              ...header,
              period: customPeriod(Number(e.target.value), range.end, header.month, header.year),
            })
          }
        >
          {Array.from({ length: lastDay }, (_, index) => index + 1).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="lbl">To day</span>
        <select
          className="inp"
          disabled={disabled}
          value={range.end}
          onChange={(e) =>
            setHeader({
              ...header,
              period: customPeriod(range.start, Number(e.target.value), header.month, header.year),
            })
          }
        >
          {Array.from({ length: lastDay - range.start + 1 }, (_, index) => range.start + index).map(
            (day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ),
          )}
        </select>
      </label>
    </div>
  );
}
