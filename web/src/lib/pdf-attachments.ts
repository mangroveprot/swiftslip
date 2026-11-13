import { useQuery } from "@tanstack/react-query";

import { obAttachmentUrlQueryOptions } from "@/features/official-business/queries";
import {
  loaAttachmentUrlQueryOptions,
  loaOtherUrlsQueryOptions,
} from "@/features/leave-of-absence/queries";
import { cosAttachmentUrlQueryOptions } from "@/features/change-of-schedule/queries";
import { otAttachmentUrlQueryOptions, otOtherUrlsQueryOptions } from "@/features/overtime/queries";
import {
  recordAttachmentUrlQueryOptions,
  recordOtherUrlsQueryOptions,
} from "@/features/records/queries";
import type { PdfAttachment } from "@/lib/save-pdf";

/**
 * The files a form should carry into its exported PDF.
 *
 * Every editor already renders an attachment card, and that card has already
 * asked for the signed URL, these hooks join the SAME query entry, so calling
 * them costs no extra request. A form with no attachment resolves to an empty
 * list and the export behaves exactly as it did before.
 */
type AttachmentKind = "ob" | "loa" | "cos" | "ot" | "record";

/** One signed-link query per form kind, a switch, so the data type survives. */
function attachmentUrlQuery(kind: AttachmentKind, id: string) {
  switch (kind) {
    case "ob":
      return obAttachmentUrlQueryOptions(id);
    case "loa":
      return loaAttachmentUrlQueryOptions(id);
    case "cos":
      return cosAttachmentUrlQueryOptions(id);
    case "ot":
      return otAttachmentUrlQueryOptions(id);
    case "record":
      return recordAttachmentUrlQueryOptions(id);
  }
}

/** The form's one main attachment (the approval slip), or nothing. */
export function usePdfAttachment(
  kind: AttachmentKind,
  id: string,
  file: { name: string } | null | undefined,
): PdfAttachment[] {
  const { data } = useQuery({ ...attachmentUrlQuery(kind, id), enabled: Boolean(file) });
  if (!file?.name || !data?.url) return [];
  return [{ name: file.name, url: data.url }];
}

/**
 * The extra attachments LOA, OT and DTR records keep (`other_attachments`),
 * whose signed links arrive as one `path → url` map.
 */
export function usePdfOtherAttachments(
  kind: "loa" | "ot" | "record",
  id: string,
  files: readonly { name: string; path: string }[],
): PdfAttachment[] {
  const options =
    kind === "loa"
      ? loaOtherUrlsQueryOptions(id)
      : kind === "ot"
        ? otOtherUrlsQueryOptions(id)
        : recordOtherUrlsQueryOptions(id);
  const { data } = useQuery({ ...options, enabled: files.length > 0 });
  if (!data || files.length === 0) return [];
  return files
    .map((file) => ({ name: file.name, url: data[file.path] }))
    .filter((file): file is PdfAttachment => Boolean(file.url));
}
