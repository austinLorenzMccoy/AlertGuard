/**
 * Triggers a browser file download for already-shaped text content (CSV) or
 * bytes (PDF). Isolated in its own module so the CSV/PDF *data shaping*
 * logic (lib/logic/csv-export.ts, lib/logic/pdf-export.ts) stays free of DOM
 * side effects and is trivial to unit test; this function is the thin,
 * mockable boundary that actually touches `document`/`URL`.
 */
export function downloadFile(
  filename: string,
  content: string | Uint8Array,
  mimeType: string,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const blob = new Blob([content as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
