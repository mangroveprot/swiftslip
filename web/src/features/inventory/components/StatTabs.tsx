/**
 * Status filter tabs that sit at the top of the asset table. Each tab shows the
 * count it filters to; "All" resets the status filter.
 */
export type StatFilterKey = "all" | "inuse" | "available" | "unassigned";

type StatTabsProps = {
  total: number;
  inUse: number;
  available: number;
  unassigned: number;
  selectedFilter: string;
  onFilterSelect: (key: StatFilterKey) => void;
};

function isActive(selectedFilter: string, key: StatFilterKey): boolean {
  return key.toLowerCase() === (selectedFilter ?? "").trim().toLowerCase();
}

export function StatTabs({
  total,
  inUse,
  available,
  unassigned,
  selectedFilter,
  onFilterSelect,
}: StatTabsProps) {
  const tabs: Array<{ key: StatFilterKey; label: string; count: number; title: string }> = [
    { key: "all", label: "All", count: total, title: "Show all assets" },
    { key: "inuse", label: "In use", count: inUse, title: "Filter: In use" },
    { key: "available", label: "Available", count: available, title: "Filter: Available" },
    { key: "unassigned", label: "Unassigned", count: unassigned, title: "Filter: Unassigned" },
  ];

  return (
    <div className="stat-tabs" role="group" aria-label="Filter assets by status">
      {tabs.map((tab) => {
        const active = isActive(selectedFilter, tab.key);
        return (
          <button
            type="button"
            key={tab.key}
            className={active ? "stat-tab stat-tab--active" : "stat-tab"}
            aria-pressed={active}
            onClick={() => onFilterSelect(tab.key)}
            title={tab.title}
          >
            <span className="stat-tab__label">{tab.label}</span>
            <span className="stat-tab__count">{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}
