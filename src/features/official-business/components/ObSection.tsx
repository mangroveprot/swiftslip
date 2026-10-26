import type { ReactNode } from "react";

/**
 * One titled block of the OB editor. A block owns its own rule/spacing (the
 * editor adds the divider above it), so it works both in the flat sheet and in
 * any future boxed layout.
 */
export function ObSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** A control that sits on the heading row, e.g. the itinerary's "Add stop". */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * The red asterisk on a label that has to be filled in — the same mark the LOA
 * sheet carries. Purely a mark: the form still saves a half-filled draft (the
 * sheet just prints what's there), so this says what the paper form needs
 * without blocking anything.
 */
export function Req() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

/**
 * A label above a filled input, the field style the OB sheet uses: no border, a
 * warm --muted fill, and a quiet focus ring. Date inputs keep the browser's own
 * calendar picker, which already sits where the design puts the icon.
 */
export function ObField({
  label,
  value,
  disabled,
  type = "text",
  required = false,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  disabled: boolean;
  type?: string;
  /** Puts the red required mark after the label text. */
  required?: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-foreground/70">
        {label}
        {required ? <Req /> : null}
      </span>
      <input
        className="h-10 w-full rounded-md border-0 bg-muted px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:text-muted-foreground"
        type={type}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
