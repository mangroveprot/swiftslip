/**
 * Phone-width showroom row. The desktop table collapses to this stacked card
 * below `md`: name plus a pencil on the first line, then a CCTV line (installed
 * state, connection dot + label, and the free note) and an Internet line.
 * Tapping anywhere on the card edits it — the board has no view-only mode.
 */
import { memo } from "react";
import type { CSSProperties } from "react";
import { PencilLine } from "lucide-react";

import type { Showroom } from "@swiftslip/shared/showrooms";
import {
  cctvConnectionLabel,
  cctvConnectionTone,
  cctvInstalledLabel,
  internetLabel,
  internetTone,
} from "@swiftslip/shared/showrooms";

type ShowroomCardProps = {
  showroom: Showroom;
  index: number;
  onEdit: (showroom: Showroom) => void;
};

export const ShowroomCard = memo(function ShowroomCard({
  showroom,
  index,
  onEdit,
}: ShowroomCardProps) {
  const note = showroom.cctv_note?.trim() ?? "";
  const connectionTone = cctvConnectionTone(showroom.cctv_connection);
  const netTone = internetTone(showroom.internet);

  return (
    <div
      className="showroom-card asset-row-fade-in-right group cursor-pointer"
      style={{ "--row-i": Math.min(index, 12) } as CSSProperties}
      onClick={() => onEdit(showroom)}
    >
      <div className="showroom-card__head">
        <span className="showroom-card__name" title={showroom.showroom_name}>
          {showroom.showroom_name}
        </span>
        <button
          type="button"
          aria-label="Edit"
          title="Edit"
          className="row-action showroom-card__action"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(showroom);
          }}
        >
          <PencilLine className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="showroom-card__row">
        <span className="showroom-card__label">CCTV</span>
        <span className="showroom-card__values">
          <span className="showroom-card__value">
            {cctvInstalledLabel(showroom.cctv_installed)}
          </span>
          <span className="showroom-card__value">
            {connectionTone !== "none" && (
              <span className={`showroom-dot showroom-dot--${connectionTone}`} />
            )}
            {cctvConnectionLabel(showroom.cctv_connection)}
          </span>
          {note !== "" && <span className="showroom-card__note">{note}</span>}
        </span>
      </div>

      <div className="showroom-card__row">
        <span className="showroom-card__label">Internet</span>
        <span className="showroom-card__values">
          <span className="showroom-card__value">
            {netTone !== "none" && <span className={`showroom-dot showroom-dot--${netTone}`} />}
            {internetLabel(showroom.internet)}
          </span>
        </span>
      </div>
    </div>
  );
});
