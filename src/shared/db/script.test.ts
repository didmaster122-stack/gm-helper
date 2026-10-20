import { describe, expect, it } from "vitest";
import { runScript, sqlLiteral } from "./script";
import { createMemoryDb } from "./testing";

describe("sqlLiteral", () => {
  it("formats values", () => {
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(true)).toBe("1");
    expect(sqlLiteral(42.5)).toBe("42.5");
    expect(sqlLiteral("D'Artagnan")).toBe("'D''Artagnan'");
  });

  it("rejects values that cannot be stored safely", () => {
    expect(() => sqlLiteral(Number.NaN)).toThrow();
    expect(() => sqlLiteral("a\u0000b")).toThrow();
  });

  it("round-trips tricky strings through SQLite", async () => {
    const db = createMemoryDb();
    await db.execute("CREATE TABLE t (v TEXT)");
    const tricky = `'; DROP TABLE t; -- «Чёрный» \\ "x" ${"\n"}😀`;
    await runScript(db, [`INSERT INTO t (v) VALUES (${sqlLiteral(tricky)})`]);
    expect(await db.select<{ v: string }>("SELECT v FROM t")).toEqual([{ v: tricky }]);
  });
});

describe("runScript", () => {
  it("rolls back the whole chunk on error", async () => {
    const db = createMemoryDb();
    await db.execute("CREATE TABLE t (v INTEGER PRIMARY KEY)");

    await expect(
      runScript(db, ["INSERT INTO t VALUES (1)", "INSERT INTO t VALUES (1)"]),
    ).rejects.toThrow();

    expect(await db.select("SELECT * FROM t")).toEqual([]);
  });

  it("splits large batches into chunks", async () => {
    const db = createMemoryDb();
    await db.execute("CREATE TABLE t (v INTEGER)");
    await runScript(
      db,
      Array.from({ length: 1201 }, (_, i) => `INSERT INTO t VALUES (${i})`),
      500,
    );
    expect(await db.select("SELECT COUNT(*) AS n FROM t")).toEqual([{ n: 1201 }]);
  });
});
