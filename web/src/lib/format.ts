/**
 * Number and byte formatting shared by the Storage settings page and its
 * cleanup modal, so the same file reads the same size in both places.
 */

/** "4 GB" / "612 MB" / "12 KB" — whatever unit keeps the number readable. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    const gb = bytes / 1024 ** 3;
    // "10 GB" / "6.6 GB" / "1.28 GB" — two decimals, trailing zeros trimmed,
    // so a whole limit reads "1 GB" instead of the noisy "1.0 GB".
    return `${gb.toFixed(2).replace(/\.?0+$/, "")} GB`;
  }
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** "4,017" — thousands separators for the file counts. */
export const formatCount = (count: number) => count.toLocaleString();

/** "3 files" / "1 file" — a count with its noun, already formatted. */
export const plural = (count: number, one: string, many = `${one}s`) =>
  `${formatCount(count)} ${count === 1 ? one : many}`;
