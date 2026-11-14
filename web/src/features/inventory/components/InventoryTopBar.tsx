/**
 * Home header, port of `Layout/TopBar.razor` (title + branch subtitle,
 * ticking clock, floor tab strip). The original also wrapped the offline
 * sync badge here; offline sync was dropped for the web port.
 */
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";

import { formatDate, formatTime } from "@swiftslip/shared/time";

import { LocationFilterRow } from "./LocationFilterRow";

type InventoryTopBarProps = {
  branchSubtitle: string;
  floorLabels: string[];
  selectedFloorLabel: string | null;
  onMenuToggle: () => void;
  onFloorSelect: (floorLabel: string | null) => void;
};

export function InventoryTopBar({
  branchSubtitle,
  floorLabels,
  selectedFloorLabel,
  onMenuToggle,
  onFloorSelect,
}: InventoryTopBarProps) {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="asset-inventory-header px-4 md:px-6 pt-4 pb-4 md:pt-7 md:pb-5 space-y-4 md:space-y-5">
      <div className="relative z-[1] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="lg:hidden -m-2 p-2 text-white/80 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={onMenuToggle}
            aria-label="Open menu"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <div className="flex flex-col leading-tight min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              Asset inventory
            </h1>
            <span className="text-sm md:text-base text-white/75 truncate mt-1">
              {branchSubtitle}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex flex-col items-end leading-tight text-white/90">
            <span className="text-sm md:text-base font-medium">{formatTime(currentTime)}</span>
            <span className="text-xs text-white/70">{formatDate(currentTime)}</span>
          </div>
        </div>
      </div>

      <div className="relative z-[1]">
        <LocationFilterRow
          floorLabels={floorLabels}
          selectedFloorLabel={selectedFloorLabel}
          onFloorSelect={onFloorSelect}
        />
      </div>
    </header>
  );
}
