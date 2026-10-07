import { IMAGE_RE, isPrintableFile } from "@/lib/attachment-file";
import type { OtherFile } from "@/shared/types";

/**
 * The print-only half of an "Other attachments" card — LOA and OT share it.
 *
 * The on-screen manager stays in the editor's form column, and that column is
 * `.no-print`, which is `display: none !important` on paper. Hiding a box hides
 * its whole subtree, so a print page rendered *inside* the manager can never
 * reach the printer; the pages therefore live here, as a separate element the
 * editor mounts in the preview column beside the approval attachment.
 *
 * One page per printable file, after the sheet, exactly like the approval
 * attachment: an image centred on the page or a PDF embedded so Chromium prints
 * its pages. A format the browser cannot render inline (docx, xlsx, …)
 * contributes no page at all — and when nothing qualifies this renders `null`,
 * so a form with only a `.docx` attached still prints exactly one page and the
 * wrapper never leaves a stray flex gap on screen.
 *
 * The pages are `hidden` on screen, so the on-screen list stays the only thing
 * the user sees.
 */
export function OtherAttachmentsPrint({
  files,
  urls,
  className,
}: {
  /** The form's extra files, straight from the form query. */
  files: OtherFile[];
  /** Signed links keyed by storage path — the same map the card lists from. */
  urls: Record<string, string> | undefined;
  /** Applied to the wrapper, which is a single item of the preview column's
   *  print order — pass `print:order-N` to place the pages after the sheet. */
  className: string;
}) {
  const printable = files
    .map((file) => ({ file, url: urls?.[file.path] }))
    .filter(
      (entry): entry is { file: OtherFile; url: string } =>
        Boolean(entry.url) && isPrintableFile(entry.file.name),
    );
  if (!printable.length) return null;

  return (
    <div className={className}>
      {printable.map(({ file, url }) => (
        <div key={`print-${file.path}`} className="hidden print:block print:break-before-page">
          {IMAGE_RE.test(file.name) ? (
            <img src={url} alt={file.name} className="mx-auto max-h-[24cm] max-w-full" />
          ) : (
            <iframe src={url} title={file.name} className="h-[24cm] w-full border-0" />
          )}
        </div>
      ))}
    </div>
  );
}
