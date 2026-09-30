/**
 * Home header — port of `Layout/TopBar.razor` (title + branch subtitle,
 * ticking clock, floor tab strip). The original also wrapped the offline
 * sync badge here; offline sync was dropped for the web port.
 */
import { useEffect, useState } from "react";

import { LocationFilterRow } from "./LocationFilterRow";

type InventoryTopBarProps = {
  branchSubtitle: string;
  floorLabels: string[];
  selectedFloorLabel: string | null;
  onMenuToggle: () => void;
  onFloorSelect: (floorLabel: string | null) => void;
};

function formatTime(date: Date): string {
  // .NET "hh:mm:ss tt" — e.g. "03:04:05 PM"
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function formatDate(date: Date): string {
  // .NET "MMM d, yyyy" — e.g. "Sep 29, 2026"
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
    <header className="asset-inventory-header px-4 md:px-6 pt-7 pb-5 space-y-5">
      <div className="relative z-[1] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="md:hidden text-white/80 hover:text-white"
            onClick={onMenuToggle}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
              Asset inventory
            </span>
            <span className="text-sm md:text-lg text-white/80 truncate mt-1">{branchSubtitle}</span>
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
