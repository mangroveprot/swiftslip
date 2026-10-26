/**
 * Small file helpers shared by every feature that hands a user-picked file to a
 * server function (biometric import, OB approval attachments, …).
 */

/**
 * Reads a File into raw base64 (no `data:` prefix) for a server function.
 * FileReader rather than a byte loop — a 10 MB attachment would otherwise take
 * seconds to encode.
 */
export async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
  // Everything after the first comma is the raw base64 payload.
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
