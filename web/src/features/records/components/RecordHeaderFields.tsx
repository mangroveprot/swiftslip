import type { ReactNode } from "react";

import { SignatureField } from "./SignaturePad";
import {
  MONTHS,
  PERIOD_LABELS,
  customPeriod,
  daysInMonth,
  parseSpan,
  periodRange,
  spanPeriod,
} from "@swiftslip/shared/period";
import type { DtrHeader, DtrTemplate, Period } from "@swiftslip/shared/types";

/**
 * The red asterisk on a label that has to be filled in — the same mark the LOA
 * and OB sheets carry. Purely a mark: the record still saves a half-filled
 * draft (the sheet just prints what's there), so this says what the paper form
 * needs without blocking anything.
 */
function Req() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

export function RecordHeaderFields({
  header,
  setHeader,
  template,
  canEdit,
  savedSignature,
}: {
  header: DtrHeader;
  setHeader: (header: DtrHeader) => void;
  template: DtrTemplate;
  canEdit: boolean;
  /** Profile signature, offered in the signature dialog as a one-click re-use. */
  savedSignature?: string | undefined;
}) {
  const isRange = header.period.startsWith("custom:") || header.period.startsWith("span:");

  return (
    <section className="form-fill @container shrink-0 rounded-xl bg-card p-5 sm:p-6 lg:p-8">
      {/* Title row — every card on this page carries one, in the same style the
          other cards use, so the form reads as a labelled box rather than a
          bare field grid. */}
      <div className="mb-2.5">
        <p className="lbl">Record details</p>
      </div>

      {/* The identity row leads the sheet — the paper form's header boxes,
          drawn the way the OB and LOA sheets draw them: label over an underline
          input, four across once this sheet is wide enough. The column count
          follows THIS sheet's container rather than the window's, the way LOA's
          does, so the live preview keeps its fixed slice of the screen. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 @xl:grid-cols-4">
        <Identity
          required
          label="Emp No."
          value={header.emp_no}
          disabled={!canEdit}
          onChange={(v) => setHeader({ ...header, emp_no: v })}
        />
        {/* A plain text field: the old name chooser (a datalist arrow that
            swapped in another employee's details) is gone by request. */}
        <Identity
          required
          label="Full name"
          value={header.name}
          disabled={!canEdit}
          onChange={(v) => setHeader({ ...header, name: v })}
        />
        <Identity
          required
          label="Designation"
          value={header.designation}
          disabled={!canEdit}
          onChange={(v) => setHeader({ ...header, designation: v })}
        />
        <Identity
          required
          label="Area"
          value={header.area}
          disabled={!canEdit}
          onChange={(v) => setHeader({ ...header, area: v })}
        />
      </div>

      {/* The period block sits under the same divider the other sheets use
          between their groups of boxes. */}
      <div className="mt-6 border-t pt-5">
        <div className="grid grid-cols-2 gap-3 @min-[44rem]:grid-cols-4">
          <SelectField
            required
            label="Month"
            value={String(header.month)}
            disabled={!canEdit}
            onChange={(v) => setHeader({ ...header, month: Number(v) })}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </SelectField>
          <Field
            required
            label="Year"
            type="number"
            value={String(header.year)}
            disabled={!canEdit}
            onChange={(v) => setHeader({ ...header, year: Number(v) })}
          />
          <SelectField
            required
            label="Days covered"
            value={isRange ? "custom" : header.period}
            disabled={!canEdit}
            onChange={(value) => {
              const current = periodRange(header.period, header.month, header.year);
              setHeader({
                ...header,
                period:
                  value === "custom"
                    ? header.period.startsWith("span:")
                      ? header.period
                      : customPeriod(current.start, current.end, header.month, header.year)
                    : (value as Period),
              });
            }}
          >
            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            <option value="custom">Custom / imported range</option>
          </SelectField>
          <Field
            required
            label={template.certified_by_label}
            value={header.certified_by}
            disabled={!canEdit}
            onChange={(v) => setHeader({ ...header, certified_by: v })}
          />
          {isRange ? (
            <RangeFields header={header} setHeader={setHeader} disabled={!canEdit} />
          ) : null}
        </div>
      </div>

      <div className="mt-6 border-t pt-5">
        <SignatureField
          value={header.employee_signature}
          disabled={!canEdit}
          savedSignature={savedSignature}
          onChange={(v) => setHeader({ ...header, employee_signature: v })}
        />
      </div>
    </section>
  );
}

/**
 * One identity value at the top of the sheet: the paper form's header box as a
 * label over an underline input, the way the OB and LOA sheets draw them. The
 * red mark says the sheet can't do without it — the input itself is ordinary,
 * editable text.
 */
function Identity({
  label,
  value,
  disabled,
  required = false,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  /** Puts the red required mark after the label text. */
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[13px] font-medium text-foreground/70">
        {label}
        {required ? <Req /> : null}
      </span>
      <input
        type="text"
        className="mt-1.5 w-full border-0 border-b border-transparent bg-transparent p-0 text-[15px] leading-snug font-semibold text-foreground outline-none transition-colors hover:border-border focus:border-primary/60 disabled:cursor-not-allowed disabled:text-muted-foreground"
        disabled={disabled}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/**
 * A label above a filled input — the field style the OB sheet uses: no border,
 * a warm --muted fill, and a quiet focus ring.
 */
function Field({
  label,
  value,
  disabled,
  required = false,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  /** Puts the red required mark after the label text. */
  required?: boolean;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-foreground/70">
        {label}
        {required ? <Req /> : null}
      </span>
      <input
        className="h-10 w-full rounded-md border-0 bg-muted px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:text-muted-foreground"
        type={type}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/** The same field with a `<select>` where the input was (Month, days). */
function SelectField({
  label,
  value,
  disabled,
  required = false,
  onChange,
  children,
}: {
  label: string;
  value: string;
  disabled: boolean;
  /** Puts the red required mark after the label text. */
  required?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-foreground/70">
        {label}
        {required ? <Req /> : null}
      </span>
      <select
        className="h-10 w-full rounded-md border-0 bg-muted px-3 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:text-muted-foreground"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
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
  const lastDay = daysInMonth(header.month, header.year);

  // Range that ends in the following month, e.g. 09/25 to 10/08.
  const span = parseSpan(header.period);
  if (span) {
    return (
      <div className="col-span-full grid grid-cols-2 gap-3">
        <SelectField
          required
          label="From day"
          value={String(span.start)}
          disabled={disabled}
          onChange={(v) =>
            setHeader({
              ...header,
              period: spanPeriod(Number(v), span.end, header.month, header.year),
            })
          }
        >
          {Array.from({ length: lastDay - 1 }, (_, index) => index + 2).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </SelectField>
        <SelectField
          required
          label="To day (next month)"
          value={String(span.end)}
          disabled={disabled}
          onChange={(v) =>
            setHeader({
              ...header,
              period: spanPeriod(span.start, Number(v), header.month, header.year),
            })
          }
        >
          {Array.from({ length: span.start - 1 }, (_, index) => index + 1).map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </SelectField>
      </div>
    );
  }

  // Range inside the sheet's month.
  const range = periodRange(header.period, header.month, header.year);
  return (
    <div className="col-span-full grid grid-cols-2 gap-3">
      <SelectField
        required
        label="From day"
        value={String(range.start)}
        disabled={disabled}
        onChange={(v) =>
          setHeader({
            ...header,
            period: customPeriod(Number(v), range.end, header.month, header.year),
          })
        }
      >
        {Array.from({ length: lastDay }, (_, index) => index + 1).map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </SelectField>
      <SelectField
        required
        label="To day"
        value={String(range.end)}
        disabled={disabled}
        onChange={(v) =>
          setHeader({
            ...header,
            period: customPeriod(range.start, Number(v), header.month, header.year),
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
      </SelectField>
    </div>
  );
}
