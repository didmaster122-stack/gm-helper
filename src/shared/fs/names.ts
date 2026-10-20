/** Folders starting with "_" or "." are service folders (e.g. "_tokens"), not systems or groups. */
export function isServiceName(name: string): boolean {
  return name.startsWith("_") || name.startsWith(".");
}
