/**
 * One starter chip under an assistant's greeting bubble: a short label the
 * employee can click instead of typing the first message.
 */
export type QuickStartOption = {
  /** What the chip reads. */
  label: string;
  /** Message sent when clicked — defaults to the label. */
  prompt?: string;
  /** The chip opens the attachment picker instead of sending text. */
  attach?: boolean;
};

/**
 * The "QUICK START" row below the greeting: one click kicks off the most
 * common ways to start filling this form — a canned prompt or the file
 * picker for a photo/PDF of the supporting document.
 */
export function QuickStartChips({
  options,
  disabled = false,
  onPick,
}: {
  options: QuickStartOption[];
  disabled?: boolean;
  onPick: (option: QuickStartOption) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Quick start
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            className="rounded-full border border-regasco/45 px-3 py-1.5 text-xs font-medium text-regasco-deep transition-colors hover:bg-regasco/10 disabled:opacity-50"
            disabled={disabled}
            onClick={() => onPick(option)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
