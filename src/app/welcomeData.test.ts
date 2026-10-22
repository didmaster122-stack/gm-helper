import { describe, expect, it } from "vitest";
import type { Campaign } from "../modules/campaigns";
import type { Session } from "../modules/sessions";
import type { RecentItem, RecentKind } from "../shared/db";
import { campaignCardSummary, continueSummary, otherCampaigns, visibleRecent } from "./welcomeData";

const TODAY = "2026-10-21";

function session(number: number, date: string | null, played: boolean): Session {
  return {
    id: `s${number}`,
    campaignId: "c1",
    number,
    date,
    played,
    planNoteId: null,
    recap: "",
    recapEventId: null,
    items: [],
    createdAt: "",
    updatedAt: "",
  };
}

function campaign(id: string, archived = false): Campaign {
  return {
    id,
    name: id,
    system: "D&D 5e",
    description: "",
    coverArtId: null,
    archived,
    createdAt: "",
    updatedAt: "",
  };
}

const recent = (kind: RecentKind, objectId: string): RecentItem => ({
  campaignId: "c1",
  kind,
  objectId,
  openedAt: "2026-10-21T10:00:00.000Z",
});

describe("visibleRecent", () => {
  it("shows existing objects with their titles and reports the deleted ones", () => {
    const titles = new Map<RecentKind, Map<string, string>>([
      ["note", new Map([["n1", "Таверна"]])],
      ["battlemap", new Map([["m1", "Склеп"]])],
    ]);
    const { shown, gone } = visibleRecent(
      [
        recent("note", "n1"),
        recent("note", "deleted"),
        recent("battlemap", "m1"),
        recent("art", "a"),
      ],
      titles,
    );
    expect(shown.map((e) => e.title)).toEqual(["Таверна", "Склеп"]);
    expect(gone.map((i) => i.objectId)).toEqual(["deleted", "a"]);
  });

  it("limits the list but still finds every deleted object", () => {
    const titles = new Map([
      [
        "note" as const,
        new Map([
          ["a", "A"],
          ["b", "B"],
        ]),
      ],
    ]);
    const { shown, gone } = visibleRecent(
      [recent("note", "a"), recent("note", "b"), recent("note", "x")],
      titles,
      1,
    );
    expect(shown.map((e) => e.objectId)).toEqual(["a"]);
    expect(gone.map((i) => i.objectId)).toEqual(["x"]);
  });
});

describe("continueSummary", () => {
  it("tells when the last session was and when the next one is", () => {
    const sessions = [session(14, "2026-10-20", true), session(15, "2026-10-24", false)];
    expect(continueSummary("D&D 5e", sessions, TODAY)).toBe(
      "D&D 5e · сессия 14 была вчера · следующая через 3 дня",
    );
  });

  it("handles a campaign without sessions and a next session without a date", () => {
    expect(continueSummary("D&D 5e", [], TODAY)).toBe("D&D 5e · сессий ещё не было");
    expect(continueSummary("D&D 5e", [session(1, null, false)], TODAY)).toBe(
      "D&D 5e · сессий ещё не было",
    );
    expect(
      continueSummary("D&D 5e", [session(1, "2026-10-01", true), session(2, null, false)], TODAY),
    ).toBe("D&D 5e · сессия 1 была 20 дней назад · следующая без даты");
  });

  it("does not say a past date is ahead", () => {
    const sessions = [session(1, "2026-10-01", true), session(2, "2026-10-19", false)];
    expect(continueSummary("D&D 5e", sessions, TODAY)).toBe(
      "D&D 5e · сессия 1 была 20 дней назад · следующая — 19 окт",
    );
  });
});

describe("campaignCardSummary", () => {
  it("shows the system, the last played session and its date", () => {
    const sessions = [session(3, "2026-10-19", true), session(4, null, false)];
    expect(campaignCardSummary("Pathfinder 2e", sessions, TODAY)).toBe(
      "Pathfinder 2e · Сессия 3 · 19 окт",
    );
    expect(campaignCardSummary("Pathfinder 2e", [], TODAY)).toBe("Pathfinder 2e");
  });
});

describe("otherCampaigns", () => {
  it("leaves out the active campaign and puts finished ones last", () => {
    const list = [campaign("done", true), campaign("active"), campaign("b"), campaign("c")];
    expect(otherCampaigns(list, "active").map((c) => c.id)).toEqual(["b", "c", "done"]);
  });
});
