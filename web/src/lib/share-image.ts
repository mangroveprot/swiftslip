/**
 * Share a form as one image, or hand it over as a file.
 *
 * `Save as PDF` is what filing wants. A chat app wants a picture, so this
 * captures the same print-layout sheet (through `sheetPng`, which reuses the
 * PDF stage and its print rules) and delivers it the way each platform can
 * actually take it:
 *
 *   – **Phones** (Android, iOS): the system share sheet with the file. Viber,
 *     Messenger, Facebook and WhatsApp attach it to the conversation properly.
 *   – **Desktops**: the clipboard, copied by us. Windows' own share dialog is
 *     deliberately NOT used there: it hands the picture to the target app's
 *     share handler, and Viber's handler answers "the file(s) are copied, paste
 *     it in the chat" while leaving the clipboard empty — a message about a
 *     copy that never happened. Copying it here means the paste works.
 *   – **No clipboard either**: a `.png` download, and the toast says to attach
 *     it. `Save as PNG` is the same file on demand, for anyone who would rather
 *     attach it than paste it.
 *
 * Nothing leaves the browser on its own: the picture only moves when a person
 * picks an app, pastes it, or saves it.
 *
 * The clipboard and file sharing need a secure context — https or localhost. On
 * a plain-http LAN address both are refused and the chain lands on the download.
 */
import { sheetPng } from "./save-pdf";
import { toast } from "./toast";

/** A phone or tablet, where the share sheet is the right hand-off. */
function isHandheld(): boolean {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPod|Mobile/i.test(ua)) return true;
  // iPadOS reports a desktop Safari UA; a Mac with a touch screen does not
  // exist, so touch points are what tell the two apart. A Windows touch laptop
  // also reports them, and must stay on the clipboard path: its share dialog
  // gives files to Viber, which drops them.
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/** `navigator.canShare` exists but refuses files on some desktop browsers. */
function canShareFile(file: File): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

/** Put the picture on the clipboard, `false` when this browser cannot. */
async function copyImage(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

/** The paste shortcut of the machine the person is on. */
function pasteKey(): string {
  return /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "Cmd+V" : "Ctrl+V";
}

/** A file the person can attach themselves. */
function downloadImage(blob: Blob, fileName: string): void {
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

/** The sheet behind `sheetId`, captured, with the id of its loading toast. */
async function capture(
  sheetId: string,
  loadingMessage: string,
): Promise<{ blob: Blob; toastId: string | number } | null> {
  const element = document.getElementById(sheetId);
  if (!element) {
    toast.error("The preview is not ready yet. Try again in a moment.");
    return null;
  }
  const toastId = toast.loading(loadingMessage);
  try {
    return { blob: await sheetPng(element), toastId };
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not prepare the image.", {
      id: toastId,
    });
    return null;
  }
}

/** `SwiftSlip_OB_Juan_Dela_Cruz` -> `SwiftSlip_OB_Juan_Dela_Cruz.png`. */
function pngName(fileName: string): string {
  return `${fileName.replace(/\.(png|pdf)$/i, "")}.png`;
}

/**
 * `Save as PNG` in the Export menu: the same picture as a download, which is
 * what someone attaching it in Viber instead of pasting it wants.
 */
export async function saveSheetPng(sheetId: string, fileName: string): Promise<void> {
  const shot = await capture(sheetId, "Preparing image\u2026");
  if (!shot) return;
  downloadImage(shot.blob, pngName(fileName));
  toast.success("Image saved", {
    id: shot.toastId,
    description: "Attach it in Viber, Messenger or Facebook.",
  });
}

/**
 * The one-liner every editor's Export menu uses. Reports its own outcome as a
 * toast, so a click handler needs no try/catch.
 */
export async function shareSheetImage(sheetId: string, fileName: string): Promise<void> {
  const shot = await capture(sheetId, "Preparing image\u2026");
  if (!shot) return;

  const { blob, toastId } = shot;
  const name = pngName(fileName);
  const file = new File([blob], name, { type: "image/png" });

  // Phones first: there the share sheet really does attach the file.
  if (isHandheld() && canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: fileName });
      toast.dismiss(toastId);
      return;
    } catch (error) {
      // The person closed the sheet: that is a choice, not a failure.
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.dismiss(toastId);
        return;
      }
      // Anything else falls through to the clipboard.
    }
  }

  if (await copyImage(blob)) {
    toast.success("Image copied", {
      id: toastId,
      description: `Open the chat and press ${pasteKey()} to paste it.`,
    });
    return;
  }

  downloadImage(blob, name);
  toast.success("Image saved", {
    id: toastId,
    description: "Attach it in Viber, Messenger or Facebook.",
  });
}
