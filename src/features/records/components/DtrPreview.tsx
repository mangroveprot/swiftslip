import { APP } from "@/config/app";
import { formatPeriodDateRange, formatShortDate } from "@/shared/period";
import type { DtrEntry, DtrHeader, DtrTemplate } from "@/shared/types";

/** Company form fill used in public/dtr_template.pdf for title + column headers. */
const TEMPLATE_HEADER_FILL = "#bfbfbf";

export function DtrPreview({
  template,
  header,
  days,
  entryFor,
}: {
  template: DtrTemplate;
  header: DtrHeader;
  days: number[];
  entryFor: (day: number) => DtrEntry;
}) {
  const monthRange = formatPeriodDateRange(header.period, header.month, header.year);

  return (
    <div
      id="dtr-sheet"
      className="print-sheet mx-auto w-full bg-paper px-6 py-5 text-[11px] leading-tight text-ink shadow-sm ring-1 ring-border"
    >
      <img src={APP.logoPath} alt="" className="mb-3 h-[42px] w-auto object-contain object-left" />

      <div
        className="mb-3 border border-ink py-[5px] text-center text-[12px] font-bold tracking-wide"
        style={{ backgroundColor: TEMPLATE_HEADER_FILL }}
      >
        {template.title}
      </div>

      <table className="mb-3 mt-0 w-full table-fixed border-collapse">
        <tbody>
          <HeaderRow label="EMP NO." value={header.emp_no} short />
          <HeaderRow label="NAME" value={header.name} />
          <HeaderRow label="DESIGNATION" value={header.designation} />
          <HeaderRow label="AREA" value={header.area} />
        </tbody>
      </table>

      <table className="mb-3 w-full table-fixed border-collapse">
        <tbody>
          <tr>
            <td className="w-[4.5rem] border border-ink px-2 py-[3px]">MONTH</td>
            <td className="border border-ink px-2 py-[3px]">{monthRange}</td>
            <td className="w-[3.5rem] border border-ink px-2 py-[3px]">YEAR</td>
            <td className="w-[5.5rem] border border-ink px-2 py-[3px]">{header.year}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-0 w-full table-fixed border-collapse text-center">
        <thead>
          <tr className="font-bold" style={{ backgroundColor: TEMPLATE_HEADER_FILL }}>
            <th className="w-16 border border-ink px-1 py-1.5">DATE</th>
            <th className="w-[4.5rem] border border-ink px-1 py-1.5">{template.columns.in}</th>
            <th className="w-[4.5rem] border border-ink px-1 py-1.5">{template.columns.out}</th>
            <th className="border border-ink px-1 py-1.5">{template.columns.schedule}</th>
            <th className="border border-ink px-1 py-1.5">{template.columns.remarks}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const e = entryFor(d);
            return (
              <tr key={d}>
                <td className="border border-ink px-1 py-[3px]">
                  {formatShortDate(d, header.month, header.year)}
                </td>
                <td className="border border-ink px-1 py-[3px]">{e.time_in}</td>
                <td className="border border-ink px-1 py-[3px]">{e.time_out}</td>
                <td className="border border-ink px-1 py-[3px]">{e.schedule}</td>
                <td className="border border-ink px-1 py-[3px]">{e.remarks}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-10">
        <div className="relative mx-auto flex h-[4.75rem] w-full max-w-md items-end justify-center">
          {header.name ? (
            <p className="absolute bottom-1 left-1/2 z-0 -translate-x-1/2 text-center text-[11px] font-medium tracking-wide text-ink">
              {header.name}
            </p>
          ) : null}
          {header.employee_signature ? (
            <img
              src={header.employee_signature}
              alt=""
              className="relative z-10 mb-[-2px] h-[4.25rem] w-auto max-w-[18rem] object-contain mix-blend-multiply"
            />
          ) : null}
        </div>
        <div className="border-b border-ink" />
        <p className="mt-1 text-center">{template.employee_signature_label}</p>

        <p className="mt-8">{template.certified_by_label}</p>
        <p className="mt-6 min-h-4 text-center font-medium">{header.certified_by}</p>
        <div className="border-b border-ink" />
        <p className="mt-1">{template.certifier_signature_label}</p>
      </div>
    </div>
  );
}

function HeaderRow({ label, value, short }: { label: string; value: string; short?: boolean }) {
  return (
    <tr>
      <td className="w-[6.5rem] border border-ink px-2 py-[3px]">{label}</td>
      <td className="border border-ink px-2 py-[3px]">{value}</td>
      {short ? <td className="w-1/2 border-0" /> : null}
    </tr>
  );
}
