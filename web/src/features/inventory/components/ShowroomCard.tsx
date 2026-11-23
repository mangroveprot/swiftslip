/**
 * Phone-width showroom row. The desktop table collapses to this stacked card
 * below `md`: photo/letter tile, name + location and a pencil (or link while
 * unlinked) on the first line, then Status and Action required (read from the
 * linked Summary row), a CCTV line (installed state, connection dot + label, and
 * the free note) and an Internet line. Tapping the thumbnail previews the photo;
 * tapping anywhere else on the card edits it — the board has no view-only mode.
 */
import { memo } from "react";
import type { CSSProperties } from "react";
import { ExternalLink, Link2, PencilLine } from "lucide-react";

import type { Showroom } from "@swiftslip/shared/showrooms";
import {
  cctvConnectionLabel,
  cctvConnectionTone,
  cctvInstalledLabel,
  internetLabel,
  internetTone,
  showroomInitials,
  showroomLinkActionLabel,
  showroomLinkStatusLabel,
  showroomUpdateStatusTone,
} from "@swiftslip/shared/showrooms";
import { isHttpUrl } from "@swiftslip/shared/showroom-updates";

type ShowroomCardProps = {
  showroom: Showroom;
  index: number;
  onEdit: (showroom: Showroom) => void;
  /** The thumbnail opens a full-size preview instead of the drawer. */
  onPreview: (showroom: Showroom) => void;
};

export const ShowroomCard = memo(function ShowroomCard({
  showroom,
  index,
  onEdit,
  onPreview,
}: ShowroomCardProps) {
  const note = showroom.cctv_note?.trim() ?? "";
  const location = showroom.link?.location?.trim() ?? "";
  const mapUrl =
    showroom.link?.map_url && isHttpUrl(showroom.link.map_url) ? showroom.link.map_url : "";
  const connectionTone = cctvConnectionTone(showroom.cctv_connection);
  const netTone = internetTone(showroom.internet);
  const statusTone = showroomUpdateStatusTone(showroom.link?.status ?? null);

  return (
    <div
      className="showroom-card asset-row-fade-in-right group cursor-pointer"
      style={{ "--row-i": Math.min(index, 12) } as CSSProperties}
      onClick={() => onEdit(showroom)}
    >
      <div className="showroom-card__head">
        <div className="showroom-card__identity">
          {showroom.photo_thumb ? (
            <button
              type="button"
              className="showroom-card__thumb showroom-card__thumb--button"
              aria-label={`Preview ${showroom.showroom_name} photo`}
              onClick={(event) => {
                event.stopPropagation();
                onPreview(showroom);
              }}
            >
              <img
                src={showroom.photo_thumb}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            </button>
          ) : (
            <span className="showroom-card__thumb showroom-card__thumb--empty" aria-hidden="true">
              {showroomInitials(showroom.showroom_name)}
            </span>
          )}
          <span className="showroom-card__identity-text">
            <span className="showroom-card__name" title={showroom.showroom_name}>
              {showroom.showroom_name}
            </span>
            {location !== "" &&
              (mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  title="Open in Google Maps"
                  className="group/loc flex w-fit max-w-full items-center gap-0.5 rounded-sm text-xs leading-4 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="min-w-0 truncate group-hover/loc:underline group-hover/loc:underline-offset-2">
                    {location}
                  </span>
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                </a>
              ) : (
                <span className="showroom-card__location" title={location}>
                  {location}
                </span>
              ))}
          </span>
        </div>
        <button
          type="button"
          aria-label={showroom.link ? "Edit" : "Link showroom"}
          title={showroom.link ? "Edit" : "Link showroom"}
          className="row-action showroom-card__action"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(showroom);
          }}
        >
          {showroom.link ? (
            <PencilLine className="size-4" aria-hidden="true" />
          ) : (
            <Link2 className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="showroom-card__row">
        <span className="showroom-card__label">Status</span>
        <span className="showroom-card__values">
          <span className={showroom.link ? "showroom-card__value" : "showroom-card__muted"}>
            {statusTone !== "none" && (
              <span className={`showroom-dot showroom-dot--${statusTone}`} />
            )}
            {showroomLinkStatusLabel(showroom.link)}
          </span>
        </span>
      </div>

      <div className="showroom-card__row">
        <span className="showroom-card__label">Action required</span>
        <span className="showroom-card__values">
          {showroom.link ? (
            <span className="showroom-card__value">{showroomLinkActionLabel(showroom.link)}</span>
          ) : (
            <button
              type="button"
              className="showroom-link-action"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(showroom);
              }}
            >
              Link showroom
            </button>
          )}
        </span>
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
