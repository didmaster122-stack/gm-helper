import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  BackupError,
  backupFileName,
  importedCampaignName,
  parseBackup,
} from "./format";

const NOW = "2026-10-21T00:00:00.000Z";

function errorKind(text: string): string | null {
  try {
    parseBackup(text, NOW);
    return null;
  } catch (e) {
    return e instanceof BackupError ? e.kind : "other";
  }
}

describe("campaign backup envelope", () => {
  const valid = {
    format: BACKUP_FORMAT,
    version: 1,
    campaign: { name: " Проклятие ", system: "D&D 5e", description: "Готика" },
    relations: { characters: [] },
  };

  it("reads the campaign and hands the sections over as they are", () => {
    const envelope = parseBackup(JSON.stringify(valid), NOW);
    expect(envelope.campaign).toEqual({
      name: "Проклятие",
      system: "D&D 5e",
      description: "Готика",
      coverArtId: null,
      createdAt: NOW,
    });
    expect(envelope.relations).toEqual({ characters: [] });
    expect(envelope.timeline).toBeUndefined();
  });

  it("reads version 1 to 4 files", () => {
    for (const version of [1, 2, 3, 4]) {
      expect(errorKind(JSON.stringify({ ...valid, version }))).toBeNull();
    }
  });

  it("converts files before version 4 to no sessions and no cover", () => {
    const old = { ...valid, version: 3, campaign: { ...valid.campaign, coverArtId: "a1" } };
    const envelope = parseBackup(JSON.stringify({ ...old, sessions: { sessions: [{}] } }), NOW);
    expect(envelope.sessions).toEqual({ sessions: [] });
    expect(envelope.campaign.coverArtId).toBeNull();
  });

  it("hands over the sessions section and the cover of version 4 files", () => {
    const sessions = { sessions: [{ number: 1 }] };
    const file = {
      ...valid,
      version: 4,
      campaign: { ...valid.campaign, coverArtId: "a1" },
      sessions,
    };
    const envelope = parseBackup(JSON.stringify(file), NOW);
    expect(envelope.sessions).toEqual(sessions);
    expect(envelope.campaign.coverArtId).toBe("a1");
  });

  it("hands over the notes section, absent in files before version 3", () => {
    expect(parseBackup(JSON.stringify({ ...valid, version: 2 }), NOW).notes).toBeUndefined();
    const notes = { tags: [], notes: [] };
    expect(parseBackup(JSON.stringify({ ...valid, version: 3, notes }), NOW).notes).toEqual(notes);
  });

  it("tells what is wrong with a file", () => {
    expect(errorKind("{oops")).toBe("notJson");
    expect(errorKind(JSON.stringify({ format: "gm-helper.battlemap", version: 2 }))).toBe(
      "notBackup",
    );
    expect(errorKind(JSON.stringify({ ...valid, version: 5 }))).toBe("newerVersion");
    expect(errorKind(JSON.stringify({ ...valid, version: 0 }))).toBe("notBackup");
    expect(errorKind(JSON.stringify({ ...valid, campaign: { name: "Без системы" } }))).toBe(
      "badCampaign",
    );
  });
});

describe("names", () => {
  it("makes a safe file name with the date", () => {
    expect(backupFileName('Тьма: "Начало"', new Date(NOW))).toBe(
      "Тьма_ _Начало_ 2026-10-21.gmcampaign.json",
    );
  });

  it("marks an imported copy when the name is taken", () => {
    expect(importedCampaignName("Тьма", ["Свет"], "импорт", 100)).toBe("Тьма");
    expect(importedCampaignName("Тьма", ["тьма"], "импорт", 100)).toBe("Тьма (импорт)");
    expect(importedCampaignName("Тьма", ["Тьма", "Тьма (импорт)"], "импорт", 100)).toBe(
      "Тьма (импорт 2)",
    );
    const long = "Д".repeat(100);
    const name = importedCampaignName(long, [long], "импорт", 100);
    expect(name).toHaveLength(100);
    expect(name.endsWith(" (импорт)")).toBe(true);
  });
});
