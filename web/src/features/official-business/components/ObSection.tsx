import { useId, type ReactNode } from "react";

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
 * The plain-English line under a required cell that is still empty. It says
 * what to do ("Select the date of the OB.") rather than restating the field
 * name or printing a validation code. The id lets the input point at it via
 * `aria-describedby`.
 */
export function ObHint({ text, id }: { text?: string | undefined; id?: string | undefined }) {
  if (!text) return null;
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-destructive">
      {text}
    </p>
  );
}

/**
 * The red asterisk on a label that has to be filled in, the same mark the LOA
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
  invalid = false,
  hint,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  disabled: boolean;
  type?: string;
  /** Puts the red required mark after the label text. */
  required?: boolean;
  /** The submit check found this required cell empty. */
  invalid?: boolean | undefined;
  /** What to do about it, shown in red under the input once it is empty. */
  hint?: string | undefined;
  onChange: (value: string) => void;
  className?: string;
}) {
  const hintId = useId();
  return (
    <div className={`block ${className}`}>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-foreground/70">
          {label}
          {required ? <Req /> : null}
        </span>
        <input
          className={`h-10 w-full rounded-md border bg-muted px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:text-muted-foreground ${
            invalid ? "border-destructive/70" : "border-transparent"
          }`}
          type={type}
          disabled={disabled}
          value={value}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <ObHint text={hint} id={hintId} />
    </div>
  );
}
