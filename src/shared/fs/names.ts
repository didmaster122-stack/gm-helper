/** Folders starting with "_" or "." are service folders (e.g. "_tokens"), not systems or groups. */
export function isServiceName(name: string): boolean {
  return name.startsWith("_") || name.startsWith(".");
}

/** Windows-safe file name part (no reserved characters or trailing dots); `fallback` when empty. */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return cleaned === "" ? fallback : cleaned;
}
