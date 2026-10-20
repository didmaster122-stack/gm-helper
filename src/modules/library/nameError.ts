import { ru } from "../../shared/i18n/ru";
import { validateName } from "./domain/paths";

/** UI message for a new file/folder name, or null if it is fine. */
export function nameError(
  name: string,
  siblings: readonly string[],
  current?: string,
): string | null {
  const error = validateName(name);
  if (error) return ru.library.nameErrors[error];
  const lower = name.trim().toLowerCase();
  const taken = siblings.some(
    (s) => s.toLowerCase() === lower && s.toLowerCase() !== current?.toLowerCase(),
  );
  return taken ? ru.library.nameErrors.exists : null;
}
