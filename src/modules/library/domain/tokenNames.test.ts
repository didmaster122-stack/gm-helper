import { describe, expect, it } from "vitest";
import {
  nextTokenFileName,
  resizedTokenFileName,
  retargetTokenNames,
  tokenFileName,
  tokenNumber,
  tokensFolder,
} from "./tokenNames";

describe("token file names", () => {
  it("puts tokens into _tokens next to the art", () => {
    expect(tokensFolder("D&D 5e/Нежить/lich.png")).toBe("D&D 5e/Нежить/_tokens");
    expect(tokensFolder("loose.png")).toBe("_tokens");
  });

  it("numbers tokens one past the highest used for the same art", () => {
    expect(nextTokenFileName("lich", [])).toBe("lich.token-1.png");
    expect(
      nextTokenFileName("Лич", ["лич.token-1.png", "Лич.token-3.png", "lich-king.token-9.png"]),
    ).toBe("Лич.token-4.png");
  });

  it("does not confuse an art with a longer name sharing a prefix", () => {
    expect(nextTokenFileName("lich", ["lich.v2.token-5.png"])).toBe("lich.token-1.png");
  });

  it("reads token numbers", () => {
    expect(tokenNumber("a.b.token-12.png")).toBe(12);
    expect(tokenNumber("a.png")).toBeNull();
  });
});

describe("retargetTokenNames", () => {
  it("keeps numbers when renaming the art", () => {
    expect(retargetTokenNames(["lich.token-1.png", "lich.token-3.png"], "Король", [])).toEqual([
      "Король.token-1.png",
      "Король.token-3.png",
    ]);
  });

  it("picks the next free number on a clash in the target folder", () => {
    expect(
      retargetTokenNames(["lich.token-1.png", "lich.token-2.png"], "lich", [
        "LICH.token-1.png",
        "other.png",
      ]),
    ).toEqual(["lich.token-2.png", "lich.token-3.png"]);
  });

  it("keeps foreign names, made unique", () => {
    expect(retargetTokenNames(["face.png"], "lich", ["face.png"])).toEqual(["face (2).png"]);
  });
});

describe("token size in file names", () => {
  it("writes the size of tokens larger than one cell", () => {
    expect(tokenFileName("дракон", 2, 3)).toBe("дракон.token-2-3x3.png");
    expect(tokenFileName("дракон", 2, 1)).toBe("дракон.token-2.png");
  });

  it("numbers tokens of any size together", () => {
    expect(nextTokenFileName("lich", ["lich.token-1.png", "lich.token-4-2x2.png"], 3)).toBe(
      "lich.token-5-3x3.png",
    );
    expect(tokenNumber("lich.token-4-2x2.png")).toBe(4);
    expect(tokenNumber("lich.token-4-2x3.png")).toBeNull();
  });

  it("changes the size suffix and keeps the number", () => {
    expect(resizedTokenFileName("lich.token-4.png", 2)).toBe("lich.token-4-2x2.png");
    expect(resizedTokenFileName("lich.token-4-2x2.png", 1)).toBe("lich.token-4.png");
    expect(resizedTokenFileName("my token.png", 2)).toBe("my token.png");
  });

  it("keeps the size when the art is renamed", () => {
    expect(retargetTokenNames(["lich.token-1-4x4.png"], "Король", [])).toEqual([
      "Король.token-1-4x4.png",
    ]);
    expect(
      retargetTokenNames(["lich.token-1-2x2.png"], "Король", ["Король.token-1-2x2.png"]),
    ).toEqual(["Король.token-2-2x2.png"]);
  });
});
