import { describe, expect, it } from "vitest";
import { parseSessionsBackup, remapSessions, toSessionsBackup } from "./backup";
import type { Session } from "./types";

const NOW = "2026-10-21T00:00:00.000Z";

const session: Session = {
  id: "s1",
  campaignId: "c1",
  number: 14,
  date: "2026-10-20",
  played: true,
  planNoteId: "n1",
  recap: "Победа над @[character:ch1|Страд]",
  recapEventId: "e1",
  items: [
    { id: "i1", text: "Карта склепа", done: true },
    { id: "i2", text: "Музыка", done: false },
  ],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
};

describe("sessions backup", () => {
  it("survives a round trip with new ids and linked plan notes", () => {
    const parsed = parseSessionsBackup(
      JSON.parse(JSON.stringify(toSessionsBackup([session]))),
      NOW,
    );
    let n = 0;
    const [out] = remapSessions(parsed, "c2", () => `new-${++n}`, {
      notes: new Map([["n1", "n9"]]),
      events: new Map([["e1", "e9"]]),
      mentions: new Map([["ch1", "ch9"]]),
    });
    expect(out).toEqual({
      ...session,
      id: "new-1",
      campaignId: "c2",
      planNoteId: "n9",
      recap: "Победа над @[character:ch9|Страд]",
      recapEventId: "e9",
      items: [
        { id: "new-2", text: "Карта склепа", done: true },
        { id: "new-3", text: "Музыка", done: false },
      ],
    });
  });

  it("drops links to a note and an event that are not in the file", () => {
    const parsed = parseSessionsBackup(toSessionsBackup([session]), NOW);
    const empty = new Map<string, string>();
    const [out] = remapSessions(parsed, "c2", () => "x", {
      notes: empty,
      events: empty,
      mentions: empty,
    });
    expect(out?.planNoteId).toBeNull();
    expect(out?.recapEventId).toBeNull();
    expect(out?.recap).toBe(session.recap);
  });

  it("reads damaged data leniently", () => {
    expect(parseSessionsBackup(undefined, NOW)).toEqual({ sessions: [] });
    const parsed = parseSessionsBackup(
      {
        sessions: [
          { number: 1, date: "суббота", items: [{ text: "  " }, { text: "Ок", done: 1 }] },
          { number: 1 },
          { number: 0 },
          { number: "2" },
        ],
      },
      NOW,
    );
    expect(parsed.sessions).toEqual([
      {
        number: 1,
        date: null,
        played: false,
        planNoteId: null,
        recap: "",
        recapEventId: null,
        items: [{ text: "Ок", done: false }],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });
});
