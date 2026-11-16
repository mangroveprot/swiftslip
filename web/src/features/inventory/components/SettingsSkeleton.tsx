/**
 * Loading placeholder for Settings: the five lookup-option cards, each with
 * its header (title, description, count, "+ Add") and a few option rows. The
 * row heights match `OptionManager`'s, so the page settles without a jump when
 * the data lands.
 */
const CARDS: Array<{ title: string; rows: number }> = [
  { title: "Branches", rows: 6 },
  { title: "Departments", rows: 5 },
  { title: "Status options", rows: 4 },
  { title: "Condition options", rows: 4 },
  { title: "Asset types", rows: 5 },
];

function Bar({ className = "" }: { className?: string }) {
  return <span className={`asset-skeleton ${className}`} aria-hidden="true" />;
}

export function SettingsSkeleton() {
  return (
    <div className="max-w-3xl space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Loading settings</span>

      {CARDS.map((card) => (
        <div
          key={card.title}
          className="bg-card text-card-foreground border border-border rounded-lg overflow-hidden"
          aria-hidden="true"
        >
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Bar className="h-3.5 w-24" />
              <Bar className="mt-2 h-3 w-64 max-w-full" />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Bar className="h-3 w-12" />
              <Bar className="h-3 w-8" />
            </div>
          </div>

          <div className="divide-y divide-border">
            {Array.from({ length: card.rows }, (_, index) => (
              <div key={index} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <Bar className="h-3.5 w-32" />
                  <Bar className="mt-1.5 h-3 w-16" />
                </div>
                <Bar className="size-4" />
                <Bar className="size-4" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
