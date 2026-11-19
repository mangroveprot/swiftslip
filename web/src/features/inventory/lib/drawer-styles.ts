/**
 * The field sheet shared by the two inventory drawers (Showroom, Asset).
 *
 * One set of classes for both, so a label, a section rule or the Cancel button
 * can never drift between the showroom panel and the asset panel. The values
 * follow the supplied drawer design: each group is a hairline-separated
 * section, labels are small and dark above their control, and the field itself
 * sits on `--field` (white on the light card, recessed in dark mode) rather
 * than the page cream.
 *
 * The banner header is deliberately not here: both drawers keep their own
 * `banner.webp` header, only the form body is shared.
 */

/** A text field / select / textarea surface. */
export const FIELD =
  "w-full rounded-lg border border-input bg-field px-3 py-2 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus:border-[#ea6a2e] focus:ring-2 focus:ring-[#ea6a2e]/25 focus:outline-none";

/** A native select, with room for its chevron. */
export const SELECT = `${FIELD} pr-8`;

/** The label above a control. */
export const LABEL = "mb-1.5 block text-xs font-semibold text-foreground";

/** A label for the small follow-up inputs (new type, monitor serial, …). */
export const SUB_LABEL = "mb-1 block text-[11px] font-medium text-foreground/80";

/**
 * One drawer section: a group of fields with a rule underneath.
 *
 * The rule is deliberately faint (`/40`): at full `border-border` the line
 * read as a hard bar across the sheet and pulled the eye away from the fields,
 * while the sections are already separated by their heading and spacing.
 */
export const SECTION = "border-b border-border/40 py-5 last:border-b-0";

/** The heading of a drawer section. */
export const SECTION_TITLE = "mb-3 text-sm font-semibold tracking-tight text-foreground";

/** The quiet, bordered Cancel beside the orange primary action. */
export const CANCEL_BUTTON =
  "rounded-lg border border-input bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--inv-orange)] disabled:cursor-not-allowed disabled:opacity-50";
