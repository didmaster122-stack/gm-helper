import { describe, expect, it } from "vitest";
import {
  artName,
  classifyPath,
  isSupportedImage,
  replacePrefix,
  suggestFreeName,
  toAbsolute,
  validateName,
} from "./paths";

describe("classifyPath", () => {
  it("recognises System/Group/file", () => {
    expect(classifyPath("D&D 5e/Нежить/lich.png")).toEqual({
      system: "D&D 5e",
      group: "Нежить",
      unsorted: false,
      fileName: "lich.png",
    });
  });

  it.each([
    ["lich.png", null, null],
    ["D&D 5e/lich.png", "D&D 5e", null],
    ["D&D 5e/Нежить/Личи/lich.png", "D&D 5e", "Нежить"],
  ])("marks %s as unsorted", (path, system, group) => {
    expect(classifyPath(path)).toMatchObject({ system, group, unsorted: true });
  });
});

describe("isSupportedImage", () => {
  it.each([
    ["a.png", true],
    ["a.JPG", true],
    ["a.jpeg", true],
    ["a.webp", true],
    ["a.gif", false],
    ["a.svg", false],
    ["png", false],
  ])("%s → %s", (name, expected) => expect(isSupportedImage(name)).toBe(expected));
});

describe("artName", () => {
  it("prefers display name, falls back to file name without extension", () => {
    expect(artName({ displayName: "Лич", fileName: "lich.png" })).toBe("Лич");
    expect(artName({ displayName: "  ", fileName: "lich.v2.png" })).toBe("lich.v2");
    expect(artName({ displayName: null, fileName: "lich.png" })).toBe("lich");
  });
});

describe("replacePrefix", () => {
  it("rewrites paths inside the folder only", () => {
    expect(replacePrefix("A/B/x.png", "A/B", "A/C")).toBe("A/C/x.png");
    expect(replacePrefix("A/B", "A/B", "A/C")).toBe("A/C");
    expect(replacePrefix("A/Bx/x.png", "A/B", "A/C")).toBeNull();
  });
});

describe("toAbsolute", () => {
  it("joins with a single separator", () => {
    expect(toAbsolute("C:\\Арты\\", "D&D 5e/x.png")).toBe("C:\\Арты/D&D 5e/x.png");
    expect(toAbsolute("C:\\Арты", "")).toBe("C:\\Арты");
  });
});

describe("validateName", () => {
  it.each([
    ["Нежить", null],
    ["  ", "empty"],
    ["a/b", "invalidChars"],
    ["D&D: 5e", "invalidChars"],
    ["trailing.", "invalidChars"],
    ["tab\there", "invalidChars"],
    ["con", "reserved"],
    ["_tokens", "service"],
    ["x".repeat(121), "tooLong"],
  ])("%s → %s", (name, expected) => expect(validateName(name)).toBe(expected));
});

describe("suggestFreeName", () => {
  it("keeps a free name and numbers taken ones case-insensitively", () => {
    expect(suggestFreeName("lich.png", ["other.png"])).toBe("lich.png");
    expect(suggestFreeName("lich.png", ["LICH.png", "lich (2).png"])).toBe("lich (3).png");
  });
});
