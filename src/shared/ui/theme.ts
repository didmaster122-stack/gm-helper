import { useMemo } from "react";
import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

/*
 * The theme is a per-machine view preference: it lives in localStorage, so it is known
 * synchronously before the first paint (the database opens later) and nothing flashes.
 */
const STORAGE_KEY = "gm-helper.theme";

const darkQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // Storage can be unavailable; fall back to the system theme.
  }
  return "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

function applyTheme(preference: ThemePreference): Theme {
  const theme = resolveTheme(preference, darkQuery()?.matches ?? true);
  document.documentElement.dataset.theme = theme;
  // The native title bar follows too; outside Tauri (tests, browser preview) this fails quietly.
  try {
    void getCurrentWindow()
      .setTheme(preference === "system" ? null : theme)
      .catch(() => undefined);
  } catch {
    // Not running inside Tauri.
  }
  return theme;
}

interface ThemeState {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: "system",
  theme: "dark",
  setPreference(preference) {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Not saved, but still applied for this run.
    }
    set({ preference, theme: applyTheme(preference) });
  },
}));

/** Applies the saved theme and follows the system one. Call once before rendering. */
export function initTheme(): void {
  const preference = readPreference();
  useThemeStore.setState({ preference, theme: applyTheme(preference) });
  darkQuery()?.addEventListener("change", () => {
    const { preference: current } = useThemeStore.getState();
    if (current === "system") useThemeStore.setState({ theme: applyTheme(current) });
  });
}

export const useTheme = (): Theme => useThemeStore((s) => s.theme);

/** Reads a design token (e.g. `--canvas`) for drawing on Canvas, where CSS variables do not apply. */
export function themeColor(name: `--${string}`): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A design token's value for Canvas drawing, refreshed when the theme changes. */
export function useThemeColor(name: `--${string}`): string {
  const theme = useTheme();
  return useMemo(() => {
    void theme; // The attribute is already switched when `theme` changes.
    return themeColor(name);
  }, [name, theme]);
}
