/**
 * The single browser-download primitive for the app. Every CSV / Excel / PDF /
 * JSON save must go through `saveBlob` rather than hand-rolling an anchor.
 *
 * Two details decide whether the saved file keeps its name, and both were being
 * dropped by the hand-rolled copies:
 *
 *  1. The anchor has to be attached to the document when it is clicked.
 *  2. The object URL has to stay alive until the download manager has committed
 *     the entry. Calling `URL.revokeObjectURL` on the line after `click()` races
 *     that commit — the bytes still land (the transfer already started) but
 *     Chromium/Edge lose the `download` attribute and fall back to naming the
 *     file after the blob UUID, with no extension. That race is timing
 *     dependent, which is why it shows up with real files on a real profile and
 *     not under automation.
 */

/** Matches what SheetJS and jsPDF use — long enough that the commit always wins. */
const REVOKE_DELAY_MS = 60_000;

const MIME_EXTENSIONS: Record<string, string> = {
  "text/csv": "csv",
  "text/plain": "txt",
  "application/json": "json",
  "application/pdf": "pdf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

/** Extension for a Content-Type, ignoring any `; charset=…` parameters. */
export function extensionForMimeType(mimeType: string | null | undefined): string | undefined {
  if (!mimeType) return undefined;
  return MIME_EXTENSIONS[mimeType.split(";")[0].trim().toLowerCase()];
}

/**
 * Strips characters Windows and macOS reject in filenames and guarantees a
 * non-empty result — an empty `download` attribute is treated as absent, which
 * is the other way a file ends up named after the blob UUID.
 */
export function sanitizeFilename(name: string, fallback = "download"): string {
  const cleaned = name
    .split("")
    .map((ch) => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? "-" : ch))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();
  return cleaned || fallback;
}

/** `20260806-1432` — sortable, filename-safe, local time. */
export function downloadTimestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}`
  );
}

/** Builds `report-name-20260806-1432.csv` from a title and an extension. */
export function timestampedFilename(base: string, extension: string, date = new Date()): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "report";
  return `${slug}-${downloadTimestamp(date)}.${extension}`;
}

/** Saves a blob to disk under `filename`. Safe to call from any click handler. */
export function saveBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;

  const name = sanitizeFilename(filename);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/** Saves text content (CSV, JSON, …) to disk. */
export function saveTextFile(
  text: string,
  filename: string,
  mimeType = "text/csv;charset=utf-8;",
): void {
  saveBlob(new Blob([text], { type: mimeType }), filename);
}
