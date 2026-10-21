import { describe, expect, it } from "vitest";
import { backupFileName, parseBackupName, planAutoBackup } from "./backups";

const at = (d: number, h = 12) => new Date(2026, 9, d, h, 5, 9);

describe("backup names", () => {
  it("round-trips both kinds in local time", () => {
    const date = at(21, 19);
    expect(backupFileName("auto", date)).toBe("gm-helper-2026-10-21-190509.db");
    expect(parseBackupName(backupFileName("auto", date))).toEqual({ kind: "auto", date });
    expect(parseBackupName(backupFileName("before-restore", date))).toEqual({
      kind: "before-restore",
      date,
    });
  });

  it("ignores other files and impossible dates", () => {
    expect(parseBackupName("gm-helper.db")).toBeNull();
    expect(parseBackupName("gm-helper.backup-v5-2026.db")).toBeNull();
    expect(parseBackupName("gm-helper-2026-02-30-120000.db")).toBeNull();
    expect(parseBackupName("notes.txt")).toBeNull();
  });
});

describe("planAutoBackup", () => {
  it("makes the first copy in an empty folder", () => {
    expect(planAutoBackup([], at(21))).toEqual({
      create: backupFileName("auto", at(21)),
      remove: [],
    });
  });

  it("does nothing when today already has a copy", () => {
    const names = [backupFileName("auto", at(21, 8)), backupFileName("auto", at(20))];
    expect(planAutoBackup(names, at(21, 23))).toEqual({ create: null, remove: [] });
  });

  it("keeps the newest copies including the new one", () => {
    const names = [1, 2, 3, 4].map((d) => backupFileName("auto", at(d)));
    const plan = planAutoBackup(names, at(21), 3);
    expect(plan.create).toBe(backupFileName("auto", at(21)));
    expect(plan.remove.sort()).toEqual([names[0], names[1]]);
  });

  it("never removes copies made before a restore or foreign files", () => {
    const restore = backupFileName("before-restore", at(1));
    const names = [restore, "readme.txt", ...[2, 3].map((d) => backupFileName("auto", at(d)))];
    expect(planAutoBackup(names, at(21), 1).remove).toEqual(names.slice(2).reverse());
  });
});
