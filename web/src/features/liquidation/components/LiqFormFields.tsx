import { useEffect, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import { PlaceChips } from "@/components/common/PlaceChips";
import { SignatureField } from "@/features/records/components/SignaturePad";
import {
  LIQ_AMOUNT_KEYS,
  liqAmount,
  liqAmountInWords,
  liqDate,
  liqIsoDate,
  liqLineTotal,
  liqMoney,
  liqTotals,
  type LiqAmountKey,
} from "@swiftslip/shared/liq";
import type { LiqExpense, LiqForm } from "@swiftslip/shared/types";

import { lastFilledLiqLine, LIQ_LINES } from "../lib/draft-form";

/** The columns the sheet prints, labelled the way its headings read. */
const AMOUNT_LABELS: Record<LiqAmountKey, string> = {
  transpo: "Transpo",
  fuel_gas: "Fuels / Gas",
  meals: "Meals",
  office_supplies: "Office supplies",
  load_accommodation: "Load / Accom.",
  entertainment_gifts: "Entertainment & gifts",
  other_expenses: "Other business",
};

/** The column a row's amount sits in, the first one holding a value. */
function amountKeyOf(entry: LiqExpense): LiqAmountKey | null {
  return LIQ_AMOUNT_KEYS.find((key) => entry[key].trim() !== "") ?? null;
}

/**
 * Write `amount` into one column and clear the other six. A line is one
 * receipt, and a receipt belongs to one column, the same shape the assistant
 * fills when it reads a photo.
 */
function withAmount(entry: LiqExpense, key: LiqAmountKey, amount: string): LiqExpense {
  const next = { ...entry };
  for (const amountKey of LIQ_AMOUNT_KEYS) next[amountKey] = amountKey === key ? amount : "";
  return next;
}

/** The boxes the printed sheet can't do without, in form order. */
const REQUIRED_BOXES: { label: string; id: string; filled: (form: LiqForm) => boolean }[] = [
  { label: "Department", id: "liq-department", filled: (f) => !!f.department.trim() },
  {
    label: "Section / Location",
    id: "liq-section_location",
    filled: (f) => !!f.section_location.trim(),
  },
  { label: "Date prepared", id: "liq-date_prepared", filled: (f) => !!f.date_prepared.trim() },
  { label: "Trip to", id: "liq-trip_to", filled: (f) => !!f.trip_to.trim() },
  { label: "Purpose", id: "liq-purpose", filled: (f) => !!f.purpose.trim() },
  { label: "Prepared by", id: "liq-prepared_by", filled: (f) => !!f.prepared_by.trim() },
  { label: "Approved by", id: "liq-approved_by", filled: (f) => !!f.approved_by.trim() },
];

function focusBox(id: string) {
  const box = document.getElementById(id);
  if (!box) return;
  box.scrollIntoView({ block: "center" });
  box.focus();
}

/**
 * The cells the office actually fills, drawn in the same card language as the
 * other forms. The four expense rows the sheet prints are editable here; the
 * rest of the sheet prints exactly as the paper form leaves it.
 */
export function LiqFormFields({
  form,
  setForm,
  entries,
  setEntry,
  onDeleteLine,
  canEdit,
  tripOptions,
  savedSignature,
}: {
  form: LiqForm;
  setForm: (form: LiqForm) => void;
  entries: LiqExpense[];
  /** Replace one visible row (0..LIQ_LINES-1). */
  setEntry: (index: number, entry: LiqExpense) => void;
  /** Remove one visible row; the editor closes the gap and blanks the last. */
  onDeleteLine: (index: number) => void;
  canEdit: boolean;
  /** Destinations already used on the employee's OB forms, the trip is the same. */
  tripOptions: string[];
  /** Signature saved on My Account, offered under the field like the other forms. */
  savedSignature?: string | undefined;
}) {
  const needs = REQUIRED_BOXES.filter((box) => !box.filled(form));
  const totals = liqTotals(entries);
  // An empty row has no amount to read its column from, so the column the user
  // picked is remembered here until they type (or the assistant fills the row).
  const [columns, setColumns] = useState<Record<number, LiqAmountKey>>({});
  // The card only shows the lines in use, so a new form starts with one card
  // instead of fifteen empty ones. The button opens another line (up to the 15
  // the form stores), the assistant filling a later line grows the list to
  // cover it, and deleting one closes the gap.
  const [shownLines, setShownLines] = useState(() => Math.max(1, lastFilledLiqLine(entries)));

  useEffect(() => {
    const filled = lastFilledLiqLine(entries);
    if (filled > 0) setShownLines((shown) => Math.max(shown, filled));
  }, [entries]);

  function addLine() {
    setShownLines((shown) => Math.min(LIQ_LINES, shown + 1));
  }

  function deleteLine(index: number) {
    onDeleteLine(index);
    setShownLines((shown) => Math.max(1, shown - 1));
  }

  return (
    <section className="form-fill @container shrink-0 rounded-xl bg-card p-5 sm:p-6 lg:p-8">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="lbl">Liquidation details</p>
        {needs.length ? (
          <p className="text-xs text-muted-foreground">
            Still needed:{" "}
            {needs.map((box, i) => (
              <span key={box.id}>
                {i > 0 ? ", " : ""}
                <button
                  type="button"
                  className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                  onClick={() => focusBox(box.id)}
                >
                  {box.label}
                </button>
              </span>
            ))}
          </p>
        ) : (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5" aria-hidden="true" />
            Every box the sheet needs is filled in
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 @xl:grid-cols-4">
        <Field
          id="liq-department"
          label="Department"
          value={form.department}
          disabled={!canEdit}
          onChange={(department) => setForm({ ...form, department })}
        />
        <Field
          id="liq-section_location"
          label="Section / Location"
          value={form.section_location}
          disabled={!canEdit}
          onChange={(section_location) => setForm({ ...form, section_location })}
        />
        <Field
          id="liq-date_prepared"
          label="Date prepared"
          type="date"
          value={liqIsoDate(form.date_prepared)}
          disabled={!canEdit}
          onChange={(iso) => setForm({ ...form, date_prepared: iso ? liqDate(iso) : "" })}
        />
        <Field
          id="liq-prepared_by"
          label="Prepared by"
          value={form.prepared_by}
          disabled={!canEdit}
          onChange={(prepared_by) => setForm({ ...form, prepared_by })}
        />

        <div className="col-span-2">
          <label className="lbl" htmlFor="liq-trip_to">
            Trip to
          </label>
          <PlaceChips
            id="liq-trip_to"
            value={form.trip_to}
            options={tripOptions}
            disabled={!canEdit}
            ariaLabel="Add a destination"
            onChange={(trip_to) => setForm({ ...form, trip_to })}
          />
        </div>
        <TextArea
          id="liq-purpose"
          label="Purpose"
          value={form.purpose}
          rows={2}
          className="col-span-2"
          disabled={!canEdit}
          onChange={(purpose) => setForm({ ...form, purpose })}
        />

        <fieldset>
          <legend className="lbl">Currency</legend>
          <div className="flex flex-wrap gap-x-8 gap-y-1.5">
            {["PESOS", "DOLLARS"].map((currency) => (
              <label key={currency} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="liq-currency"
                  className="size-3.5 accent-primary"
                  checked={form.currency === currency}
                  disabled={!canEdit}
                  onChange={() => setForm({ ...form, currency })}
                />
                {currency === "PESOS" ? "Pesos" : "Dollars"}
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          id="liq-approved_by"
          label="Approved by"
          value={form.approved_by}
          disabled={!canEdit}
          onChange={(approved_by) => setForm({ ...form, approved_by })}
        />
      </div>

      {/* The signature printed above PREPARED BY on the sheet. The profile's
          saved signature is offered under the field, exactly like OB / LOA /
          COS / OT, so a form saved before the column existed can still be
          signed (and a draft can be signed without visiting My Account). */}
      <SignatureField
        value={form.employee_signature}
        disabled={!canEdit}
        savedSignature={savedSignature}
        onChange={(employee_signature) => setForm({ ...form, employee_signature })}
      />

      <div className="mt-6 border-t pt-5">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <p className="lbl">Expense lines</p>
            <p className="text-xs text-muted-foreground">
              Add a line per receipt. Type the amount, then choose the column it belongs to, the
              assistant fills a line the same way when it reads a photo. Up to {LIQ_LINES} lines.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-outline shrink-0 disabled:opacity-60"
            disabled={!canEdit || shownLines >= LIQ_LINES}
            title={
              shownLines >= LIQ_LINES
                ? `A form holds up to ${LIQ_LINES} expense lines`
                : "Add another expense line"
            }
            onClick={addLine}
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Add expense</span>
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {entries.slice(0, shownLines).map((entry, index) => {
            const column = amountKeyOf(entry) ?? columns[entry.idx] ?? "meals";
            const line = liqLineTotal(entry);
            return (
              <div key={entry.idx} className="rounded-lg border border-border/70 p-3">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Line {index + 1}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    {line ? (
                      <span className="text-xs text-muted-foreground">{liqMoney(line)}</span>
                    ) : null}
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-40"
                      aria-label={`Delete expense line ${index + 1}`}
                      title={
                        shownLines <= 1
                          ? "A form needs at least one expense line"
                          : "Delete this expense line"
                      }
                      disabled={!canEdit || shownLines <= 1}
                      onClick={() => deleteLine(index)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                </div>
                <div className="grid gap-3 @min-[26rem]:grid-cols-2 @min-[44rem]:grid-cols-[8rem_minmax(0,1fr)_7rem_9rem]">
                  <Field
                    id={`liq-expense_date-${entry.idx}`}
                    label="Date"
                    type="date"
                    value={liqIsoDate(entry.expense_date)}
                    disabled={!canEdit}
                    onChange={(iso) =>
                      setEntry(index, { ...entry, expense_date: iso ? liqDate(iso, false) : "" })
                    }
                  />
                  <Field
                    id={`liq-expense_description-${entry.idx}`}
                    label="Description"
                    value={entry.description}
                    disabled={!canEdit}
                    onChange={(description) => setEntry(index, { ...entry, description })}
                  />
                  <Field
                    id={`liq-expense_amount-${entry.idx}`}
                    label="Amount"
                    value={entry[column]}
                    placeholder="0.00"
                    inputMode="decimal"
                    disabled={!canEdit}
                    onChange={(amount) => setEntry(index, withAmount(entry, column, amount))}
                    onBlur={(amount) =>
                      setEntry(index, withAmount(entry, column, liqMoney(liqAmount(amount))))
                    }
                  />
                  <label className="block">
                    <span className="lbl">Column</span>
                    <select
                      id={`liq-amount-column-${entry.idx}`}
                      name="liq-amount-column"
                      className="inp"
                      disabled={!canEdit}
                      value={column}
                      aria-label={`Amount column for expense line ${index + 1}`}
                      onChange={(e) => {
                        const key = e.target.value as LiqAmountKey;
                        setColumns((prev) => ({ ...prev, [entry.idx]: key }));
                        setEntry(index, withAmount(entry, key, entry[column]));
                      }}
                    >
                      {LIQ_AMOUNT_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {AMOUNT_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t pt-5">
        <p className="text-sm text-muted-foreground">
          Grand total{" "}
          <span className="font-semibold text-foreground">{liqMoney(totals.grand) || "0.00"}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {liqAmountInWords(totals.grand, form.currency)}
        </p>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  id,
  disabled,
  placeholder,
  type = "text",
  inputMode,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  id: string;
  disabled: boolean;
  placeholder?: string;
  /** `date` opens the browser's own picker; the sheet still prints its spelling. */
  type?: "text" | "date";
  inputMode?: "text" | "decimal";
  onChange: (value: string) => void;
  onBlur?: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="lbl">{label}</span>
      <input
        id={id}
        className="inp"
        type={type}
        inputMode={inputMode}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  id,
  rows,
  className,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  id: string;
  rows: number;
  className?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="lbl">{label}</span>
      <textarea
        id={id}
        className="inp min-h-[3.5rem] resize-none"
        rows={rows}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
