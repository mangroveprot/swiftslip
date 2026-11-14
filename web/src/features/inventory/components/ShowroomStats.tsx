/**
 * Showrooms header stats, sitting in the navy banner beside the page title.
 *
 * `CCTV installed` and `Not available` double as filters: clicking one narrows
 * the board immediately (clicking again goes back to All). `Units available`
 * is stock, not a row property, so clicking it (or its pencil) opens the one
 * editable number: total CCTV units owned.
 *
 * All maths comes from `showroomCctvSummary` in `@swiftslip/shared/showrooms`,
 * so the banner and the board can never disagree about what is installed.
 */
import { useState } from "react";
import { PencilLine } from "lucide-react";

import type { Showroom, ShowroomFilter } from "@swiftslip/shared/showrooms";
import { showroomCctvSummary } from "@swiftslip/shared/showrooms";

type ShowroomStatsProps = {
  showrooms: Showroom[];
  /** Total CCTV units owned (installed + spare). */
  totalUnits: number;
  filter: ShowroomFilter;
  onFilterChange: (filter: ShowroomFilter) => void;
  /** Saves a new total; resolves false when the API refused it. */
  onSaveTotal: (totalUnits: number) => Promise<boolean>;
};

export function ShowroomStats({
  showrooms,
  totalUnits,
  filter,
  onFilterChange,
  onSaveTotal,
}: ShowroomStatsProps) {
  const { installed, available, notAvailable, installedPercent } = showroomCctvSummary(
    showrooms,
    totalUnits,
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const draftUnits = Number(draft);
  const draftValid = draft.trim() !== "" && Number.isInteger(draftUnits) && draftUnits >= installed;

  const toggle = (next: ShowroomFilter) => {
    setEditing(false);
    onFilterChange(filter === next ? "all" : next);
  };

  const startEditing = () => {
    setDraft(String(totalUnits));
    setEditing(true);
  };

  const cancelEditing = () => {
    if (saving) return;
    setEditing(false);
  };

  const save = async () => {
    if (!draftValid || saving) return;
    setSaving(true);
    const saved = await onSaveTotal(draftUnits);
    setSaving(false);
    if (saved) setEditing(false);
  };

  const statClass = (active: boolean) =>
    active ? "showroom-stats__stat showroom-stats__stat--active" : "showroom-stats__stat";

  return (
    <div className="showroom-stats">
      <div className="showroom-stats__row">
        <button
          type="button"
          className={statClass(filter === "installed")}
          aria-pressed={filter === "installed"}
          title="Show only showrooms with CCTV installed"
          onClick={() => toggle("installed")}
        >
          <span className="showroom-stats__value">{installed}</span>
          <span className="showroom-stats__label">CCTV installed</span>
        </button>

        <button
          type="button"
          className="showroom-stats__stat"
          aria-label="Edit total CCTV units"
          title="Edit total CCTV units"
          onClick={startEditing}
        >
          <span className="showroom-stats__value">
            {available}
            <PencilLine className="showroom-stats__pencil" aria-hidden="true" />
          </span>
          <span className="showroom-stats__label">Units available</span>
        </button>

        <button
          type="button"
          className={statClass(filter === "not_available")}
          aria-pressed={filter === "not_available"}
          title="Show only installed CCTV that is not online"
          onClick={() => toggle("not_available")}
        >
          <span className="showroom-stats__value">{notAvailable}</span>
          <span className="showroom-stats__label">Not available</span>
        </button>
      </div>

      {editing ? (
        <form
          className="showroom-stats__editor"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="showroom-stats__field">
            <span className="showroom-stats__field-label">Total CCTV units:</span>
            <input
              type="number"
              min={installed}
              step={1}
              inputMode="numeric"
              aria-label="Total CCTV units"
              className="showroom-stats__input"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelEditing();
              }}
            />
          </label>
          <span className="showroom-stats__field-hint">{installed} already installed</span>
          <button
            type="submit"
            className="showroom-stats__action showroom-stats__action--save"
            disabled={!draftValid || saving}
            aria-busy={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="showroom-stats__action"
            disabled={saving}
            onClick={cancelEditing}
          >
            Cancel
          </button>
        </form>
      ) : (
        <p className="showroom-stats__caption">
          {totalUnits === 0
            ? "No CCTV units recorded yet."
            : `${installed} of ${totalUnits} CCTV installed (${installedPercent}%)`}
        </p>
      )}
    </div>
  );
}
