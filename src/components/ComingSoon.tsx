export function ComingSoon({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{eyebrow}</p>
      <h1 className="mt-1 text-4xl">{title}</h1>
      <div className="mt-8 rounded-xl border border-dashed bg-card p-8">
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="mt-4 text-sm">Coming soon.</p>
      </div>
    </main>
  );
}
