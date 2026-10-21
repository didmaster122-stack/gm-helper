import { describe, expect, it } from "vitest";
import { coverHue } from "./cover";

describe("coverHue", () => {
  it("is stable, ignores case and spaces around, and stays in range", () => {
    expect(coverHue("Проклятие Страда")).toBe(coverHue("  проклятие страда "));
    for (const name of ["", "А", "Проклятие Страда", "Waterdeep", "Тьма".repeat(50)]) {
      const hue = coverHue(name);
      expect(Number.isInteger(hue) && hue >= 0 && hue < 360).toBe(true);
    }
  });

  it("gives different names different hues", () => {
    expect(coverHue("Проклятие Страда")).not.toBe(coverHue("Подземье"));
  });
});
