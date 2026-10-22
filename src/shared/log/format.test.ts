import { describe, expect, it } from "vitest";
import { formatLogEntry } from "./format";

const now = new Date("2026-10-21T19:05:09.000Z");

describe("formatLogEntry", () => {
  it("joins values on one stamped line", () => {
    expect(formatLogEntry(now, ["Failed to save", 3, { id: "a" }])).toBe(
      '[2026-10-21T19:05:09.000Z] Failed to save 3 {"id":"a"}\n',
    );
  });

  it("indents the stack and follows the cause", () => {
    const error = new Error("outer", { cause: new Error("inner") });
    error.stack = "Error: outer\nat save (store.ts:1)";
    const cause = error.cause as Error;
    cause.stack = "Error: inner\nat load (repo.ts:2)";
    expect(formatLogEntry(now, [error])).toBe(
      "[2026-10-21T19:05:09.000Z] Error: outer\n    at save (store.ts:1)\n" +
        "    Caused by: Error: inner\n    at load (repo.ts:2)\n",
    );
  });

  it("survives values JSON cannot write", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(formatLogEntry(now, [loop, undefined])).toBe(
      "[2026-10-21T19:05:09.000Z] [object Object] undefined\n",
    );
  });
});
