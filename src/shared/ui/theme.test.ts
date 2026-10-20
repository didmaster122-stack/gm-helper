import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";
import { withShortcut } from "./withShortcut";

describe("resolveTheme", () => {
  it("follows the system for the system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("keeps an explicit choice regardless of the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("withShortcut", () => {
  it("adds the key in parentheses", () => {
    expect(withShortcut("Отменить", "Ctrl+Z")).toBe("Отменить (Ctrl+Z)");
  });

  it("returns what is there when one part is missing", () => {
    expect(withShortcut("Отменить", undefined)).toBe("Отменить");
    expect(withShortcut(undefined, "F1")).toBe("F1");
  });
});
