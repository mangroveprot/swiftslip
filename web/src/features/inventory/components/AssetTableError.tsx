/**
 * The assets board when its data could not be loaded: the table's own card and
 * (on wide screens) its tab strip and toolbar, with the shared error block
 * centred in the space the rows would fill. Copy and actions come from
 * `ErrorStateFromError`, so this screen says the same thing as Reports,
 * Showrooms and Settings.
 *
 * The chrome is decorative here: no counts are known, so the tabs read `—`
 * and the controls are inert. On phones it is hidden, leaving just the block.
 */
import { ErrorStateFromError } from "@/components/common/ErrorStateFromError";

const TABS = ["All", "In use", "Available", "Unassigned"];

type AssetTableErrorProps = {
  error: unknown;
  /** When the query failed (`errorUpdatedAt`); defaults to now. */
  at?: Date | null;
  onRetry: () => void;
  /** A retry is in flight: keeps the button from firing twice. */
  retrying?: boolean;
};

export function AssetTableError({ error, at, onRetry, retrying = false }: AssetTableErrorProps) {
  return (
    <div className="asset-table">
      <div className="hidden shrink-0 md:block" aria-hidden="true">
        <div className="stat-tabs pointer-events-none">
          {TABS.map((tab) => (
            <div key={tab} className="stat-tab">
              <span className="stat-tab__label">{tab}</span>
              <span className="stat-tab__count">—</span>
            </div>
          ))}
        </div>

        <div className="asset-table__toolbar pointer-events-none">
          <div className="asset-table__search relative flex h-[2.625rem] items-center text-muted-foreground">
            <svg
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M8.5 14.5a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm5.7-1.1 3.4 3.4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Search by item ID, name, or department
          </div>

          <div className="inventory-type">
            <span className="inventory-type__label">Type:</span>
            <span className="inventory-type__select inline-block">All types</span>
          </div>
        </div>
      </div>

      <ErrorStateFromError
        className="asset-table__error"
        error={error}
        at={at ?? null}
        onRetry={onRetry}
        retrying={retrying}
      />
    </div>
  );
}
