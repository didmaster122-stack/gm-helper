import { useEffect } from "react";
import { SCREEN_SEARCH_SELECTOR } from "../shared/ui";
import { MODULE_ORDER } from "./nav";
import type { ModuleId } from "./store";

interface GlobalActions {
  setModule: (m: ModuleId) => void;
  openHelp: () => void;
  openSearch: () => void;
  toggleSidebar: () => void;
}

/**
 * App-wide keys: Ctrl+1…6 and Ctrl+, switch sections, Ctrl+\ folds the spine, Ctrl+F focuses
 * the screen's search, Ctrl+K opens the app-wide search, F1 opens the shortcut list. Editors handle their own keys (undo, tools).
 */
export function useGlobalShortcuts({
  setModule,
  openHelp,
  openSearch,
  toggleSidebar,
}: GlobalActions) {
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
      const digit = /^Digit([1-6])$/.exec(e.code);
      const target = digit ? MODULE_ORDER[Number(digit[1]) - 1] : undefined;
      if (target) {
        e.preventDefault();
        setModule(target);
      } else if (e.code === "Comma") {
        e.preventDefault();
        setModule("settings");
      } else if (e.code === "Backslash") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.code === "KeyK") {
        e.preventDefault();
        openSearch();
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
  }, [setModule, openHelp, openSearch, toggleSidebar]);
}
