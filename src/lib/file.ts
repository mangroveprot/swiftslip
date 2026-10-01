/**
 * Small file helpers shared by every feature that hands a user-picked file to a
 * server function (biometric import, OB assistant attachments, …).
 */

/** Reads a File into raw base64 (no `data:` prefix) for a server function. */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes.at(i) ?? 0);
  return btoa(binary);
}
