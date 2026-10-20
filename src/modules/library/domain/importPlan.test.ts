import { describe, expect, it } from "vitest";
import { planImport } from "./importPlan";

describe("planImport", () => {
  it("renames conflicts, including between dropped files, and flags unsupported ones", () => {
    const items = planImport(
      ["C:\\in\\lich.png", "D:/other/Lich.PNG", "C:\\in\\new.webp", "C:\\in\\anim.gif"],
      ["lich.png"],
    );

    expect(
      items.map(({ targetName, conflict, unsupported }) => [targetName, conflict, unsupported]),
    ).toEqual([
      ["lich (2).png", true, false],
      ["Lich (3).PNG", true, false],
      ["new.webp", false, false],
      ["anim.gif", false, true],
    ]);
  });
});
