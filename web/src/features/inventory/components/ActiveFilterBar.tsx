/**
 * "Refined view" filter strip — port of `ActiveFilterBar.razor`.
 * Hidden entirely when no filters are active.
 */
export type FilterChip = {
  key: string;
  kind: string;
  label: string;
};

type ActiveFilterBarProps = {
  chips: FilterChip[];
  matchCount: number;
  scopeCount: number;
  onRemoveChip: (key: string) => void;
  onClearAll: () => void;
};

export function ActiveFilterBar({
  chips,
  matchCount,
  scopeCount,
  onRemoveChip,
  onClearAll,
}: ActiveFilterBarProps) {
  if (chips.length === 0) return null;

  return (
    <div className="filter-lens mb-3" role="status" aria-live="polite">
      <div className="filter-lens__rail" aria-hidden="true" />
      <div className="filter-lens__body">
        <div className="filter-lens__meta">
          <span className="filter-lens__pulse" aria-hidden="true" />
          <div>
            <p className="filter-lens__title">Refined view</p>
            <p className="filter-lens__count">
              Showing <span className="font-semibold text-slate-700">{matchCount}</span> of{" "}
              <span className="font-semibold text-slate-700">{scopeCount}</span>
            </p>
          </div>
        </div>

        <div className="filter-lens__chips">
          {chips.map((chip) => (
            <button
              type="button"
              key={chip.key}
              className="filter-lens__chip"
              title={`Remove ${chip.label}`}
              onClick={() => onRemoveChip(chip.key)}
            >
              <span className="filter-lens__chip-key">{chip.kind}</span>
              <span className="filter-lens__chip-val">{chip.label}</span>
              <svg
                className="w-3.5 h-3.5 opacity-60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          ))}
        </div>

        <button type="button" className="filter-lens__reset" onClick={onClearAll}>
          Reset to default
        </button>
      </div>
    </div>
  );
}
