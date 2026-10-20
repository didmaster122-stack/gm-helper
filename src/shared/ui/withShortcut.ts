/** Tooltip text with the key in parentheses: "Отменить (Ctrl+Z)". */
export function withShortcut(label: string | undefined, shortcut: string | undefined) {
  if (!label) return shortcut;
  return shortcut ? `${label} (${shortcut})` : label;
}
