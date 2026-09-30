/**
 * Floor tab strip inside the header — port of `LocationFilterRow.razor`.
 * Active state is a soft underline only; the filter lens shows the full story.
 */
import { formatFloorDisplay } from "../lib/helpers";

type LocationFilterRowProps = {
  /** Distinct `assets.floor_label` values for the current branch (e.g. "1st", "2nd"). */
  floorLabels: string[];
  /** `null` = "All floors". */
  selectedFloorLabel: string | null;
  onFloorSelect: (floorLabel: string | null) => void;
};

function activeTabClass(selected: string | null, floorLabel: string | null): string {
  const selectedTrimmed = selected == null || selected.trim() === "" ? null : selected.trim();
  const candidate = floorLabel == null || floorLabel.trim() === "" ? null : floorLabel.trim();

  const isActive = (candidate ?? "").toLowerCase() === (selectedTrimmed ?? "").toLowerCase();

  return isActive
    ? "px-2.5 py-1.5 rounded-md text-white font-semibold shrink-0 underline underline-offset-[6px] decoration-2 decoration-white/90"
    : "px-2.5 py-1.5 rounded-md text-white/70 hover:text-white shrink-0";
}

export function LocationFilterRow({
  floorLabels,
  selectedFloorLabel,
  onFloorSelect,
}: LocationFilterRowProps) {
  if (floorLabels.length === 0) {
    return (
      <div className="flex items-center gap-1 text-sm">
        <span className="text-xs text-white/60">
          No floor breakdown for this branch — showing all assets.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <button
        type="button"
        className={activeTabClass(selectedFloorLabel, null)}
        onClick={() => onFloorSelect(null)}
      >
        All floors
      </button>
      {floorLabels.map((floor) => (
        <button
          type="button"
          key={floor}
          className={activeTabClass(selectedFloorLabel, floor)}
          onClick={() => onFloorSelect(floor)}
        >
          {formatFloorDisplay(floor)}
        </button>
      ))}
    </div>
  );
}
