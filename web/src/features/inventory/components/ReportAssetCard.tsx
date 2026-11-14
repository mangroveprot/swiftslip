/**
 * One asset row of the branch report, phone layout. The Excel-style sheet is
 * unreadable below `md`, so each row becomes a small block: item ID, where it
 * sits, who has it, the monitor/keyboard serials, and the status over the
 * condition at the right edge.
 */
import type { ReportAssetRow } from "@swiftslip/shared/inventory";

type ReportAssetCardProps = {
  row: ReportAssetRow;
};

/** "Monitor" + value, unless the value already names itself. */
function labelValue(label: string, value: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().startsWith(label.toLowerCase()) ? trimmed : `${label} ${trimmed}`;
}

function joinParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" · ");
}

export function ReportAssetCard({ row }: ReportAssetCardProps) {
  const placement = joinParts([row.assetType, row.cubicle]);
  const who = joinParts([row.assignedTo, row.department]);
  const monitor = labelValue("Monitor", row.monitor);
  const keyboardMouse = labelValue("Keyboard & mouse", row.keyboardMouse);
  const notes = row.notes?.trim() ?? "";

  return (
    <div className="report-card">
      <div className="report-card__body">
        <span className="report-card__id">{row.itemId}</span>
        {placement !== "" && <p className="report-card__meta">{placement}</p>}
        {who !== "" && <p className="report-card__who">{who}</p>}
        {monitor && <p className="report-card__note">{monitor}</p>}
        {keyboardMouse && <p className="report-card__note">{keyboardMouse}</p>}
        {notes !== "" && <p className="report-card__note">{notes}</p>}
      </div>

      <div className="report-card__facts">
        <span className="report-card__status">{row.status || "—"}</span>
        <span className="report-card__condition">{row.condition || "—"}</span>
      </div>
    </div>
  );
}
