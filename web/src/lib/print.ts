/**
 * Printing, the one safe way.
 *
 * Every editor's Print button used to call `window.print()` directly. Their
 * Export menu is a Radix dropdown, which is portaled to `<body>` and then runs
 * a ~150 ms fade/zoom-out before it is removed — so the browser dialog often
 * opened while the menu was still on screen, and the menu landed in the
 * snapshot. On a phone, where the menu covers most of the form, that meant a
 * printed sheet with "Save as PDF / Print / Download Word" written across it.
 *
 * The print stylesheet already hides floating layers by role, but a layer that
 * is still animating out can be caught before the rule applies. This closes
 * them all first, gives the browser one frame to paint the clean page, and only
 * then opens the dialog. `beforeprint` repeats the same hiding for the keyboard
 * shortcut (Ctrl+P), which never goes through this function.
 */

/** Everything that is a floating layer rather than the page itself. */
const FLOATING_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  "[data-radix-portal]",
  "[role='menu']",
  "[role='listbox']",
  "[role='tooltip']",
  "[role='dialog']",
  "[role='alertdialog']",
].join(",");

/** Hiding one of these nodes also disables undo history, hence the list. */
const DIALOG_SELECTOR = "[role='dialog'], [role='alertdialog']";

/**
 * Close an open floating layer for real, so nothing is left mid-animation.
 *
 * Radix menus give the trigger `aria-expanded="true"` and close on the same
 * pointer event the browser synthesises here; `Escape` is the fallback for
 * layers that have no such trigger (popovers, tooltips). Anything still open
 * after both is hidden outright.
 */
export function closeFloatingLayers(): void {
  const expanded = document.querySelectorAll<HTMLElement>('[aria-expanded="true"]');
  expanded.forEach((trigger) => {
    // A dialog's own trigger is not an expanded control, so this only ever
    // fires on menus, comboboxes and disclosures.
    if (trigger.closest(DIALOG_SELECTOR)) return;
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  if (expanded.length > 0) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  document
    .querySelectorAll<HTMLElement>(FLOATING_SELECTOR)
    .forEach((node) => (node.style.display = "none"));
}

/**
 * Print the sheet: close every floating layer, wait two frames so the browser
 * has painted the page without them, then open the dialog.
 *
 * Two frames matter — one frame only guarantees the DOM changed, not that the
 * faded-out menu is gone from the painted page the snapshot is taken from.
 */
export function printSheet(): void {
  closeFloatingLayers();
  const start = () => {
    try {
      window.print();
    } finally {
      // Restore the layers once the dialog is dismissed, so the app keeps
      // working if the user cancels. `afterprint` fires when it closes.
      window.removeEventListener("afterprint", restore);
      window.addEventListener("afterprint", restore, { once: true });
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(start));
}

/** Undo the `display: none` that `closeFloatingLayers` set. */
function restore(): void {
  document
    .querySelectorAll<HTMLElement>(FLOATING_SELECTOR)
    .forEach((node) => node.style.removeProperty("display"));
}

/**
 * Keep the keyboard shortcut clean too: `Ctrl+P` never runs through
 * `printSheet`, so hide the same layers as the dialog opens. `afterprint`
 * puts them back.
 */
export function installPrintGuards(): void {
  window.addEventListener("beforeprint", closeFloatingLayers);
  window.addEventListener("afterprint", restore);
}
