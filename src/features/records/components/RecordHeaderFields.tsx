import { SignatureField } from "./SignaturePad";
import { MONTHS, PERIOD_LABELS, customPeriod, daysInMonth, periodRange } from "@/shared/period";
import type { DtrHeader, DtrTemplate, Period } from "@/shared/types";

export type EmployeeOption = {
  id: string;
  name: string;
  emp_no: string;
  designation?: string;
  area?: string;
};

export function RecordHeaderFields({
  header,
  setHeader,
  template,
  employeeOptions,
  canEdit,
}: {
  header: DtrHeader;
  setHeader: (header: DtrHeader) => void;
  template: DtrTemplate;
  employeeOptions: EmployeeOption[];
  canEdit: boolean;
}) {
  function pickEmployee(name: string) {
    const match = employeeOptions.find((e) => e.name === name);
    if (!match) {
      setHeader({ ...header, name });
      return;
    }
    setHeader({
      ...header,
      name: match.name,
      emp_no: match.emp_no || header.emp_no,
      designation: match.designation || header.designation,
      area: match.area || header.area,
    });
  }

  return (
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
                    ? customPeriod(currentRange.start, currentRange.end, header.month, header.year)
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
