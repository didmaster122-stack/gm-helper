import { describe, expect, it } from "vitest";
import {
  addItem,
  campaignStatus,
  lastPlayed,
  markPlayed,
  moveItem,
  newSession,
  nextNumber,
  nextSession,
  numberError,
  prepProgress,
  removeItem,
  renameItem,
  toggleItem,
  unmarkPlayed,
} from "./sessions";
import type { ChangeSource, PrepItem, Session } from "./types";

function source(): ChangeSource {
  let n = 0;
  return { now: "2026-10-21T10:00:00.000Z", newId: () => `new-${++n}` };
}

function session(number: number, change: Partial<Session> = {}): Session {
  return {
    ...newSession("c1", number, { now: "2026-01-01T00:00:00.000Z", newId: () => `s${number}` }),
    ...change,
  };
}

describe("sessions", () => {
  it("finds the next and the last played session by number", () => {
    const list = [session(3), session(1, { played: true }), session(2, { played: true })];
    expect(nextSession(list)?.number).toBe(3);
    expect(lastPlayed(list)?.number).toBe(2);
    expect(nextSession([session(1, { played: true })])).toBeNull();
    expect(lastPlayed([session(1)])).toBeNull();
  });

  it("numbers new sessions after the highest one", () => {
    expect(nextNumber([])).toBe(1);
    expect(nextNumber([session(1), session(4)])).toBe(5);
  });

  it("derives the campaign status", () => {
    expect(campaignStatus(false, [])).toBe("prep");
    expect(campaignStatus(false, [session(1)])).toBe("prep");
    expect(campaignStatus(false, [session(1, { played: true })])).toBe("running");
    expect(campaignStatus(true, [session(1, { played: true })])).toBe("finished");
  });

  it("marks a session played today and creates the next one", () => {
    const change = markPlayed(
      [session(1, { played: true }), session(2)],
      "s2",
      "2026-10-21",
      source(),
    );
    expect(change.remove).toEqual([]);
    expect(change.put).toHaveLength(2);
    expect(change.put[0]).toMatchObject({ id: "s2", played: true, date: "2026-10-21" });
    expect(change.put[1]).toMatchObject({ number: 3, played: false, date: null, campaignId: "c1" });
  });

  it("keeps the planned date and does not duplicate a planned next session", () => {
    const change = markPlayed(
      [session(2, { date: "2026-10-24" }), session(3)],
      "s2",
      "2026-10-25",
      source(),
    );
    expect(change.put).toHaveLength(1);
    expect(change.put[0]).toMatchObject({ played: true, date: "2026-10-24" });
  });

  it("takes the mark back and removes the untouched session it created", () => {
    const list = [session(1, { played: true, date: "2026-10-21" }), session(2)];
    expect(unmarkPlayed(list, "s1", source())).toMatchObject({
      put: [{ id: "s1", played: false, date: "2026-10-21" }],
      remove: ["s2"],
    });
    const prepared = [session(1, { played: true }), session(2, { date: "2026-10-31" })];
    expect(unmarkPlayed(prepared, "s1", source()).remove).toEqual([]);
  });

  it("checks session numbers", () => {
    const list = [session(1), session(2)];
    expect(numberError(list, "s1", 1)).toBeNull();
    expect(numberError(list, "s1", 2)).toBe("taken");
    expect(numberError(list, "s1", 0)).toBe("invalid");
    expect(numberError(list, "s1", 1.5)).toBe("invalid");
  });
});

describe("prep checklist", () => {
  const ids = () => {
    let n = 0;
    return () => `i${++n}`;
  };

  it("adds, ticks, renames, removes and counts items", () => {
    const newId = ids();
    let items = addItem([], "  Карта склепа ", newId);
    items = addItem(items, "Музыка для боя", newId);
    items = addItem(items, "   ", newId);
    expect(items.map((i) => i.text)).toEqual(["Карта склепа", "Музыка для боя"]);
    items = toggleItem(items, "i1");
    expect(prepProgress(items)).toEqual({ done: 1, total: 2 });
    items = renameItem(items, "i2", "");
    expect(items[1]?.text).toBe("Музыка для боя");
    items = renameItem(items, "i2", "Плейлист");
    expect(items[1]?.text).toBe("Плейлист");
    expect(removeItem(items, "i1").map((i) => i.id)).toEqual(["i2"]);
  });

  it("moves items within the list", () => {
    const newId = ids();
    const items = ["a", "b", "c"].reduce<PrepItem[]>((acc, t) => addItem(acc, t, newId), []);
    expect(moveItem(items, "i3", -1).map((i) => i.text)).toEqual(["a", "c", "b"]);
    expect(moveItem(items, "i1", -1).map((i) => i.text)).toEqual(["a", "b", "c"]);
    expect(moveItem(items, "i4", 1).map((i) => i.text)).toEqual(["a", "b", "c"]);
  });
});
