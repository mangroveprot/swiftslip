/**
 * The PDF sheet: the owner's supplied HTML/CSS, rebuilt as semantic markup.
 *
 * It is always mounted (hidden, aria-hidden) so "Export as PDF" can hand a real,
 * measured element to `savePdfFrom`, which renders the print layout and slices
 * it into A4-landscape pages. The rows passed in are the ones currently
 * filtered on screen, so the file is exactly what the user is looking at.
 *
 * Structure, top to bottom, as on the owner's sheet:
 *   row 1  gold title bar             – over Showroom … Action Required only
 *   row 2  plum "Total Active SR" bar – same span
 *   row 3  plum column headers        – all ten columns
 *   rows   one per showroom, then `blankRows` numbered-but-empty rows
 * The cells left of the bars (No.) and right of them (Responsible Person …
 * Vehicle) are empty, so they print white.
 */
import type { ShowroomUpdate } from "@swiftslip/shared/showroom-updates";
import {
  showroomUpdateRemarksMeta,
  showroomUpdateResponsibleMeta,
  showroomUpdateSheetDate,
  showroomUpdateStatusMeta,
  showroomUpdateVehicleMeta,
} from "@swiftslip/shared/showroom-updates";

import "../showroom-updates-sheet.css";

/** The DOM id `savePdfFrom` looks up. */
export const SHEET_ID = "sru-sheet";

const STATUS_CLASS: Record<string, string> = {
  open: "sru-s-open",
  ready: "sru-s-ready",
  in_progress: "sru-s-progress",
  pending: "sru-s-pending",
};

const REMARKS_CLASS: Record<string, string> = {
  fully_operational: "sru-r-op",
  ready_to_launch: "sru-r-launch",
  ongoing: "sru-r-ongoing",
};

const VEHICLE_CLASS: Record<string, string> = {
  with_sidecar: "sru-v-side",
  with_and_without_sidecar: "sru-v-both",
  requested: "sru-v-req",
  none: "sru-v-none",
};

/**
 * Column widths in %, No. … Vehicle (sums to 100). The same proportions as
 * showroom-updates-sheet.css, so Location is wide enough for one line and the
 * rows stay an even single line tall.
 */
const COLUMN_WIDTHS = [3, 12, 29.5, 5.5, 12, 12, 7, 7.5, 6, 5.5];

export function ShowroomUpdateSheet({
  rows,
  totalActive,
  blankRows = 0,
}: {
  rows: ShowroomUpdate[];
  /** Rows with status OPEN, the owner's definition of "active". */
  totalActive: number;
  /**
   * Numbered-but-empty rows left under the last showroom, like rows 24–28 on
   * the owner's sheet. Pass 0 (the default) for a filtered export.
   */
  blankRows?: number;
}) {
  const lastNo = rows.reduce((max, row) => Math.max(max, row.sr_no), 0);

  return (
    <div id={SHEET_ID} className="sru-sheet sru-print-sheet" aria-hidden="true">
      <table>
        <colgroup>
          {COLUMN_WIDTHS.map((width, index) => (
            <col key={index} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="sru-title">
            <td />
            <td className="sru-bar" colSpan={5}>
              SUMMARY OF SR STATUS AND UPDATES
            </td>
            <td colSpan={4} />
          </tr>
          <tr className="sru-total">
            <td />
            <td className="sru-bar" colSpan={5}>
              Total Active SR : <b>{totalActive}</b>
            </td>
            <td colSpan={4} />
          </tr>
          <tr className="sru-cols">
            <th>No.</th>
            <th>Showroom</th>
            <th>Location</th>
            <th>Status</th>
            <th>Lacking Requirements / Missing Documents</th>
            <th>Action Required</th>
            <th className="sru-side">Responsible Person</th>
            <th className="sru-side">Remarks</th>
            <th className="sru-side">Date Open</th>
            <th className="sru-side">Vehicle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = showroomUpdateStatusMeta(row.status);
            const person = showroomUpdateResponsibleMeta(row.responsible_person);
            const remarks = showroomUpdateRemarksMeta(row.remarks);
            const vehicle = showroomUpdateVehicleMeta(row.vehicle);
            return (
              <tr key={row.update_id}>
                <td className="sru-no">{row.sr_no}</td>
                <td className="sru-show">{row.showroom_name}</td>
                <td className="sru-loc">{row.location}</td>
                <td className={`sru-status ${row.status ? (STATUS_CLASS[row.status] ?? "") : ""}`}>
                  {status?.label ?? "-"}
                </td>
                <td className="sru-c">{row.requirements ?? ""}</td>
                <td className="sru-c">{row.action_required ?? ""}</td>
                <td
                  className={`sru-person ${
                    row.responsible_person ? `sru-p-${row.responsible_person}` : ""
                  }`}
                >
                  {person?.label ?? ""}
                </td>
                <td
                  className={`sru-remark ${row.remarks ? (REMARKS_CLASS[row.remarks] ?? "") : ""}`}
                >
                  {remarks?.label ?? ""}
                </td>
                <td className="sru-date">{showroomUpdateSheetDate(row.open_date)}</td>
                <td className={`sru-veh ${row.vehicle ? (VEHICLE_CLASS[row.vehicle] ?? "") : ""}`}>
                  {vehicle?.label ?? ""}
                </td>
              </tr>
            );
          })}
          {Array.from({ length: blankRows }, (_, index) => (
            <tr key={`blank-${index}`}>
              <td className="sru-no">{lastNo + index + 1}</td>
              {Array.from({ length: 9 }, (__, cell) => (
                <td key={cell} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
