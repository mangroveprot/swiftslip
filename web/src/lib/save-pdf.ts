/**
 * One way to save a form as a real PDF file — `Save as PDF` in every editor.
 *
 * The editors render each form as a pixel replica of its Word template
 * (`.print-sheet` — DTR / OB / COS / OT / LOA). Before this module the only
 * export was `window.print()` + "Save as PDF" in the browser dialog, which
 * meant the user had to know that trick. This module turns that same form into
 * a downloadable file — and it deliberately saves the **printed** layout, the
 * one Ctrl+P shows, not the narrow on-screen column:
 *
 *   1. `renderToCanvas` — the sheet is cloned into an off-screen "stage" that
 *      is exactly as wide as the paper's content box (A4 minus the `@page`
 *      margins in `src/styles.css`), with the print rules re-applied to it. So
 *      the form gets the same width, padding and A4 scaling it has in the
 *      print preview, instead of the squeezed on-screen column.
 *   2. `sliceCanvas` — that tall canvas is cut into page-sized slices that
 *      follow the sheet's own paper guides (`.pdf-break` markers first, then
 *      `page-break-*` CSS, then `avoid-break` groups), so a table row is never
 *      chopped in half by a page change.
 *   3. `imagesToPdf` — each slice becomes one page of the PDF, laid on the
 *      same A4 margins the browser uses when printing.
 *
 * Everything is loaded lazily: jspdf + html2canvas-pro are ~400 kB and only
 * matter the moment someone actually exports, so neither is in the main bundle.
 *
 * Attachments are deliberately NOT included. The browser prints an embedded
 * PDF's own pages, which a canvas capture cannot reproduce (Chrome shows the
 * viewer, not the document). "Print" keeps that behaviour — it still prints the
 * sheet plus the attached file exactly as before — while "Save as PDF" always
 * saves the form itself, which is what the button promises.
 */
import { toast } from "@/lib/toast";

/** A4 — the sheet CSS is authored against the same paper size. */
const A4 = {
  widthPt: 595.28,
  heightPt: 841.89,
} as const;

/** CSS px per millimetre (96 dpi) and PDF points per millimetre. */
const MM_TO_PX = 96 / 25.4;
const MM_TO_PT = 72 / 25.4;

/** A page turn must never leave a sliver this short behind it. */
const MIN_KEEP_PX = 24;

/** The parts of any form that should keep their row on one page. */
const AVOID_BREAK_SELECTOR = ["tr", "table > tbody > tr", ".avoid-break", ".pdf-keep", "img"].join(
  ",",
);

/** Marker that a sheet itself places where the page turns (`.pdf-break`). */
const EXPLICIT_BREAK_CLASS = "pdf-break";

/** CSS that asks for a page turn after the element. */
const CSS_BREAK_SELECTOR = ".page-break-after, [style*='break-after'], [style*='page-break-after']";

/** Attribute on the off-screen box the print-layout copy is rendered in. */
const STAGE_ATTR = "data-pdf-stage";
const STAGE_STYLE_ID = "pdf-stage-rules";

/**
 * Page margins in millimetres. These MIRROR the `@page` rules in
 * `src/styles.css` — keep the two in step, or the PDF stops matching Ctrl+P.
 */
interface Paper {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** `@page { size: A4; margin: 6mm 14mm 14mm }` — DTR / OB / COS / OT. */
const PAPER_DEFAULT: Paper = { top: 6, right: 14, bottom: 14, left: 14 };

/** `@page loa { margin: 13.8mm 5.22mm 6.35mm 9.53mm }` — the LOA template. */
const PAPER_LOA: Paper = { top: 13.8, right: 5.22, bottom: 6.35, left: 9.53 };

/**
 * The print rules, re-applied to the stage. They are a copy of the
 * `@media print` block in `styles.css` (a media query cannot be switched on for
 * just one element), so a saved PDF and Ctrl+P agree. `!important` wins over
 * the sheet's own inline `width` / padding, exactly as it does on paper.
 */
const STAGE_CSS = `
[${STAGE_ATTR}] {
  background: #fff;
}
[${STAGE_ATTR}] .no-print {
  display: none !important;
}
/* Mirrors the overlay rule in styles.css: a dropdown or dialog portaled to
   <body> is outside the copied sheet already, but hiding it by role keeps
   the stage agreeing with Ctrl+P when a menu was open at capture time. */
[${STAGE_ATTR}] [data-radix-popper-content-wrapper],
[${STAGE_ATTR}] [data-radix-portal],
[${STAGE_ATTR}] [role="menu"],
[${STAGE_ATTR}] [role="listbox"],
[${STAGE_ATTR}] [role="tooltip"],
[${STAGE_ATTR}] [role="dialog"],
[${STAGE_ATTR}] [role="alertdialog"] {
  display: none !important;
}
/* A saved PDF is the form on paper, so the assistant is cut from the snapshot
   too: its mascot, nudge bubble and footer chat overlapped the sheet on a
   phone. The live chat is portaled to <body>, outside the copied sheet, so it
   is matched by its own attributes rather than by position. */
[${STAGE_ATTR}] [aria-label^="Chat with"],
[${STAGE_ATTR}] .ai-bubble-pop,
[${STAGE_ATTR}] .ai-bubble-vanish {
  display: none !important;
}
[${STAGE_ATTR}] .print-sheet,
[${STAGE_ATTR}] .print-sheet * {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
[${STAGE_ATTR}] .print-sheet {
  box-shadow: none !important;
  border: none !important;
  margin: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  max-width: none !important;
}
[${STAGE_ATTR}] .cos-sheet {
  padding: 0 !important;
}
`;

export interface SavePdfOptions {
  /** Element to capture — the editor's own `.print-sheet` preview. */
  element: HTMLElement;
  /** Download name, without the `.pdf` extension. */
  fileName: string;
  /** Shown in the loading toast while the capture runs. */
  loadingMessage?: string;
  /** Shown when the file is on disk. */
  successMessage?: string;
}

/* ------------------------------------------------------------------ paper - */

/** The paper a form prints on — the LOA template has its own page. */
function paperFor(element: HTMLElement): Paper {
  return element.classList.contains("loa-print-sheet") ? PAPER_LOA : PAPER_DEFAULT;
}

/** The width and height of the printable area, in CSS px. */
function contentBox(paper: Paper) {
  return {
    widthPx: Math.round((210 - paper.left - paper.right) * MM_TO_PX),
    heightPx: (297 - paper.top - paper.bottom) * MM_TO_PX,
    xPt: paper.left * MM_TO_PT,
    yPt: paper.top * MM_TO_PT,
    widthPt: A4.widthPt - (paper.left + paper.right) * MM_TO_PT,
    heightPt: A4.heightPt - (paper.top + paper.bottom) * MM_TO_PT,
  };
}

/* ---------------------------------------------------------------- capture - */

/** Put the stage rules in the page once; every export reuses them. */
function ensureStageStyles(): void {
  if (document.getElementById(STAGE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STAGE_STYLE_ID;
  style.textContent = STAGE_CSS;
  document.head.append(style);
}

/**
 * Copy the sheet into an off-screen box the size of the paper's content area,
 * paint it, and hand back the canvas plus the copy (the copy is what the page
 * slicing has to measure — its wrapping is the printed one).
 *
 * The copy stays in place until `dispose()` is called, because a detached
 * element has no measurements; every caller disposes it before it returns, so
 * the app is never left with a second, duplicate sheet in the document.
 */
async function renderToCanvas(
  sheet: HTMLElement,
  paper: Paper,
): Promise<{ canvas: HTMLCanvasElement; root: HTMLElement; dispose: () => void }> {
  const { widthPx } = contentBox(paper);
  ensureStageStyles();

  // Off to the left of the viewport: laid out for real, but never seen and
  // never able to start a scrollbar.
  const stage = document.createElement("div");
  stage.setAttribute(STAGE_ATTR, "");
  stage.style.cssText = [
    "position: fixed",
    "top: 0",
    "left: -10000px",
    `width: ${widthPx}px`,
    "background: #fff",
    "pointer-events: none",
    "z-index: -1",
  ].join(";");

  const root = sheet.cloneNode(true) as HTMLElement;
  // The copy must not answer `getElementById(sheetId)` — the live sheet does.
  root.removeAttribute("id");
  stage.append(root);
  document.body.append(stage);

  const dispose = () => stage.remove();

  try {
    // Fonts and images must be painted before the capture, or the copy comes
    // out in a fallback font with empty boxes where the logo belongs.
    if (document.fonts?.ready) await document.fonts.ready;
    await waitForImages(root);

    const { default: html2canvas } = await import("html2canvas-pro");
    const width = root.offsetWidth || widthPx;
    const height = root.offsetHeight || Math.round(contentBox(paper).heightPx);
    // 2× keeps text crisp when the PDF is zoomed or printed — the same density
    // a 144 dpi scan would have, at a size that still fits in a browser canvas.
    const scale = Math.min(2, Math.max(1, 2400 / Math.max(width, height)));
    const canvas = await html2canvas(root, {
      scale,
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: false,
      logging: false,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (node) => node instanceof HTMLElement && isPrintHidden(node),
    });
    return { canvas, root, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

/** Screen-only chrome inside a sheet (buttons, hover actions). */
function isPrintHidden(node: HTMLElement): boolean {
  return node.classList.contains("no-print") || node.dataset["pdfIgnore"] === "true";
}

/* ------------------------------------------------------------------ pages - */

interface BreakCandidate {
  top: number;
  bottom: number;
  /** Where a page may turn: the element's bottom edge. */
  cut: number;
  breakAfter: boolean;
}

/**
 * Cut a tall canvas into page-sized bands. A cut lands on the last allowed
 * boundary that still fits inside the page height, so no row, image or
 * `.avoid-break` group is ever split; when nothing inside the page qualifies
 * (one element taller than the whole page) the cut falls back to the exact
 * page height rather than dropping the content.
 */
function sliceCanvas(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  pageHeightPx: number,
): HTMLCanvasElement[] {
  const ratio = canvas.width / Math.max(1, root.offsetWidth);
  const pageHeight = Math.max(1, Math.round(pageHeightPx * ratio));
  const candidates = collectBreakCandidates(root, ratio);
  const pages: HTMLCanvasElement[] = [];

  let top = 0;
  const total = canvas.height;
  while (top < total) {
    const limit = top + pageHeight;
    if (total - top <= pageHeight) {
      pages.push(cutCanvas(canvas, top, total));
      break;
    }
    const choice = pickBreak(candidates, top, limit);
    const bottom = choice && choice - top > MIN_KEEP_PX ? choice : limit;
    pages.push(cutCanvas(canvas, top, bottom));
    top = bottom;
  }
  return pages;
}

function cutCanvas(canvas: HTMLCanvasElement, top: number, bottom: number): HTMLCanvasElement {
  const page = document.createElement("canvas");
  page.width = canvas.width;
  page.height = Math.max(1, bottom - top);
  page.getContext("2d")?.drawImage(canvas, 0, -top);
  return page;
}

/** Every place a page is allowed to turn, measured against the sheet. */
function collectBreakCandidates(root: HTMLElement, ratio: number): BreakCandidate[] {
  const rootBox = root.getBoundingClientRect();
  const px = (value: number) => Math.round((value - rootBox.top) * ratio);
  const candidates: BreakCandidate[] = [];

  for (const node of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (node.closest(".no-print")) continue;
    const style = getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.position === "absolute"
    ) {
      continue;
    }
    const box = node.getBoundingClientRect();
    if (box.height < 1) continue;

    const breakAfter =
      node.classList.contains(EXPLICIT_BREAK_CLASS) ||
      node.matches(CSS_BREAK_SELECTOR) ||
      node.dataset["pdfBreak"] === "after";
    const avoid =
      node.matches(AVOID_BREAK_SELECTOR) ||
      style.breakInside === "avoid" ||
      style.pageBreakInside === "avoid" ||
      node.hasAttribute("data-pdf-keep");

    if (!breakAfter && !avoid) continue;
    candidates.push({
      top: px(box.top),
      bottom: px(box.bottom),
      cut: px(box.bottom),
      breakAfter,
    });
  }
  return candidates.sort((a, b) => a.cut - b.cut);
}

/**
 * The best cut line inside `(top, limit]`: an explicit break wins, otherwise
 * the furthest edge that does not cut through an `avoid-break` block.
 */
function pickBreak(candidates: BreakCandidate[], top: number, limit: number): number | null {
  const inside = candidates.filter((c) => c.cut > top + MIN_KEEP_PX && c.cut <= limit);
  if (!inside.length) return null;

  const explicit = inside.filter((c) => c.breakAfter).pop();
  if (explicit) return explicit.cut;

  // Walk back from the page bottom: an edge is only usable when no avoided
  // block spans it — that block would be split across two pages.
  const avoided = candidates.filter((c) => !c.breakAfter);
  for (let i = inside.length - 1; i >= 0; i -= 1) {
    const cut = inside[i]!.cut;
    const split = avoided.some((block) => block.top < cut && block.bottom > cut);
    if (!split) return cut;
  }
  return null;
}

/* -------------------------------------------------------------------- pdf - */

/** Lay every page image on its own A4 sheet, inside the print margins. */
async function imagesToPdf(
  pages: readonly HTMLCanvasElement[],
  title: string,
  paper: Paper,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
    compress: true,
  });
  pdf.setProperties({ title, creator: "SwiftSlip" });

  const box = contentBox(paper);

  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage("a4", "portrait");
    const aspect = page.height / Math.max(1, page.width);
    // A slice always fits the width; one taller than the printable area (a
    // single very tall row) is scaled down rather than cropped — showing all of
    // it beats a clean cut line.
    const drawWidth = Math.min(box.widthPt, box.heightPt / aspect);
    const drawHeight = drawWidth * aspect;
    pdf.addImage(
      page.toDataURL("image/jpeg", 0.92),
      "JPEG",
      box.xPt,
      box.yPt,
      drawWidth,
      drawHeight,
      undefined,
      "FAST",
    );
  });

  return pdf.output("blob");
}

/* ------------------------------------------------------------------- api - */

/**
 * Save an element as a PDF file the user downloads straight away.
 *
 * ```ts
 * await saveElementAsPdf({
 *   element: document.getElementById("ot-sheet")!,
 *   fileName: "SwiftSlip_OT_Juan_Dela_Cruz",
 *   loadingMessage: "Preparing PDF…",
 *   successMessage: "PDF downloaded",
 * });
 * ```
 *
 * Throws when the sheet cannot be captured — callers wrap it in try/catch and
 * show their own message, or use `savePdfFrom` which already reports the outcome.
 */
export async function saveElementAsPdf({
  element,
  fileName,
  loadingMessage = "Preparing PDF…",
  successMessage = "PDF downloaded",
}: SavePdfOptions): Promise<void> {
  const toastId = toast.loading(loadingMessage);
  try {
    const paper = paperFor(element);
    const { canvas, root, dispose } = await renderToCanvas(element, paper);
    let pages: HTMLCanvasElement[];
    try {
      pages = sliceCanvas(canvas, root, contentBox(paper).heightPx);
    } finally {
      dispose();
    }
    if (!pages.length) throw new Error("Nothing to export yet.");

    const blob = await imagesToPdf(pages, fileName, paper);
    downloadBlob(blob, `${stripExtension(fileName)}.pdf`);
    toast.success(pages.length > 1 ? `${successMessage} · ${pages.length} pages` : successMessage, {
      id: toastId,
    });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not save the PDF.", {
      id: toastId,
    });
    throw error;
  }
}

/**
 * The one-liner every editor uses: find the sheet by DOM id and save it.
 * Reports its own errors as a toast, so a click handler needs no try/catch.
 */
export async function savePdfFrom(sheetId: string, fileName: string): Promise<void> {
  const element = document.getElementById(sheetId);
  if (!element) {
    toast.error("The preview is not ready yet. Try again in a moment.");
    return;
  }
  await saveElementAsPdf({
    element,
    fileName,
    loadingMessage: "Preparing PDF…",
    successMessage: "PDF downloaded",
  }).catch(() => undefined);
}

/** A file name with anything Windows or a browser would reject, removed. */
export function pdfFileName(...parts: (string | number | undefined | null)[]): string {
  return (
    parts
      .map((part) => String(part ?? "").trim())
      .filter((part) => part.length > 0)
      .join("_")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 120) || "document"
  );
}

/* ---------------------------------------------------------------- helpers - */

function stripExtension(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL is freed.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Wait for the sheet's `<img>` elements (logo, signature, stamps) to be fully
 * painted, so no page comes out with a blank box where the logo should be.
 */
async function waitForImages(element: HTMLElement): Promise<void> {
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(
    images.map((image) => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const done = () => resolve();
        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
        // A broken image must not hang the export.
        setTimeout(done, 3000);
      });
    }),
  );
}
