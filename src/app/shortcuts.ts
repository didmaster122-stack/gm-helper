import { useEffect } from "react";
import { SCREEN_SEARCH_SELECTOR } from "../shared/ui";
import type { ModuleId } from "./store";

const MODULE_ORDER: ModuleId[] = ["library", "battlemaps", "relations", "timeline", "music"];

export const MODULE_SHORTCUTS: Record<ModuleId, string> = {
  library: "Ctrl+1",
  battlemaps: "Ctrl+2",
  relations: "Ctrl+3",
  timeline: "Ctrl+4",
  music: "Ctrl+5",
  settings: "Ctrl+,",
};

/**
 * App-wide keys: Ctrl+1…5 and Ctrl+, switch sections, Ctrl+F focuses the screen's search,
 * F1 opens the shortcut list. Editors handle their own keys (undo, delete, tools).
 */
export function useGlobalShortcuts(setModule: (m: ModuleId) => void, openHelp: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Nothing switches under an open dialog.
      if (document.querySelector(".modal-backdrop")) return;
      if (e.key === "F1") {
        e.preventDefault();
        openHelp();
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const digit = /^Digit([1-5])$/.exec(e.code);
      const target = digit ? MODULE_ORDER[Number(digit[1]) - 1] : undefined;
      if (target) {
        e.preventDefault();
        setModule(target);
      } else if (e.code === "Comma") {
        e.preventDefault();
        setModule("settings");
      } else if (e.code === "KeyF") {
        const search = document.querySelector<HTMLInputElement>(SCREEN_SEARCH_SELECTOR);
        if (!search) return;
        e.preventDefault();
        search.focus();
        search.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setModule, openHelp]);
}
