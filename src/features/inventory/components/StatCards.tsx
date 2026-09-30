/**
 * Stat cards — port of `StatCards.razor`. Each card doubles as a status
 * filter toggle ("total" resets to all).
 */
type StatFilterKey = "all" | "inuse" | "available" | "unassigned";

type StatCardsProps = {
  total: number;
  inUse: number;
  available: number;
  unassigned: number;
  selectedFilter: string;
  onFilterSelect: (key: StatFilterKey) => void;
};

function cardClass(selectedFilter: string, key: StatFilterKey, tone: string): string {
  const isActive = key.toLowerCase() === (selectedFilter ?? "").trim().toLowerCase();
  return isActive
    ? `stat-card ${tone} stat-card--active text-left w-full`
    : `stat-card ${tone} text-left w-full`;
}

export function StatCards({
  total,
  inUse,
  available,
  unassigned,
  selectedFilter,
  onFilterSelect,
}: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <button
        type="button"
        className={cardClass(selectedFilter, "all", "stat-card--total")}
        onClick={() => onFilterSelect("all")}
        title="Show all assets"
        aria-pressed={selectedFilter.toLowerCase() === "all"}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="stat-card__label">Total assets</p>
          <span className="stat-card__icon" aria-hidden="true">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </span>
        </div>
        <p className="stat-card__value">
          <span>{total}</span>
          <span className="stat-card__unit">recorded</span>
        </p>
      </button>

      <button
        type="button"
        className={cardClass(selectedFilter, "inuse", "stat-card--inuse")}
        onClick={() => onFilterSelect("inuse")}
        title="Filter: In use"
        aria-pressed={selectedFilter.toLowerCase() === "inuse"}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="stat-card__label">In use</p>
          <span className="stat-card__icon" aria-hidden="true">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </span>
        </div>
        <p className="stat-card__value">
          <span>{inUse}</span>
          <span className="stat-card__unit">active</span>
        </p>
      </button>

      <button
        type="button"
        className={cardClass(selectedFilter, "available", "stat-card--available")}
        onClick={() => onFilterSelect("available")}
        title="Filter: Available"
        aria-pressed={selectedFilter.toLowerCase() === "available"}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="stat-card__label">Available</p>
          <span className="stat-card__icon" aria-hidden="true">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </span>
        </div>
        <p className="stat-card__value">
          <span>{available}</span>
          <span className="stat-card__unit">units</span>
        </p>
      </button>

      <button
        type="button"
        className={cardClass(selectedFilter, "unassigned", "stat-card--unassigned")}
        onClick={() => onFilterSelect("unassigned")}
        title="Filter: Unassigned"
        aria-pressed={selectedFilter.toLowerCase() === "unassigned"}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="stat-card__label">Unassigned</p>
          <span className="stat-card__icon" aria-hidden="true">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
              />
            </svg>
          </span>
        </div>
        <p className="stat-card__value">
          <span>{unassigned}</span>
          <span className="stat-card__unit">no owner</span>
        </p>
      </button>
    </div>
  );
}
