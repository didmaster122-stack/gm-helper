import { describe, expect, it } from "vitest";
import { parseTimelineBackup, remapTimeline } from "./backup";
import { event, idSource, lane, link, marker, timeline } from "./testing";

const NOW = "2026-10-21T00:00:00.000Z";

const source = timeline({
  lanes: [
    lane("main", { kind: "main", name: "", sort: 0 }),
    lane("pq", { kind: "personal", name: "Борис", characterId: "boris", sort: 1, hidden: true }),
  ],
  events: [
    event("e1", { laneId: "main", characterIds: ["boris", "ghost"], tags: ["бой"] }),
    event("e2", { laneId: "pq", session: null, status: "happened", gameDate: "Зима" }),
    event("e3", { laneId: "lost-lane" }),
  ],
  links: [link("l1", "e1", "e2"), link("l2", "e1", "gone")],
  markers: [marker("m1", { level: 2, session: null, label: "1492" })],
});

const local = (items: readonly { campaignId: string }[]) =>
  items.map((item) => ({ ...item, campaignId: "" }));

describe("timeline backup", () => {
  it("survives a JSON round trip", () => {
    const parsed = parseTimelineBackup(JSON.parse(JSON.stringify(source)), NOW);
    expect(parsed.sessionCount).toBe(3);
    expect(parsed.currentSession).toBe(1);
    expect(parsed.lanes).toEqual(local(source.lanes));
    expect(parsed.events).toEqual(local(source.events));
    expect(parsed.links).toEqual(local(source.links));
    expect(parsed.markers).toEqual(local(source.markers));
  });

  it("reads damaged data leniently", () => {
    const parsed = parseTimelineBackup(
      {
        sessionCount: -2,
        currentSession: 4,
        lanes: [{ id: "x", kind: "weird" }, {}],
        events: [{ id: "e", laneId: "x", title: "  ", session: 0 }],
        markers: [{ id: "m", label: "Утро", level: 7, session: 2.5 }],
      },
      NOW,
    );
    expect(parsed.sessionCount).toBe(0);
    expect(parsed.currentSession).toBeNull();
    expect(parsed.lanes).toHaveLength(1);
    expect(parsed.lanes[0]?.kind).toBe("custom");
    expect(parsed.events).toEqual([]);
    expect(parsed.markers[0]).toMatchObject({ level: 1, session: null });
  });

  it("gives new ids and fixes lanes, characters and links", () => {
    const ids = idSource();
    const out = remapTimeline(
      parseTimelineBackup(JSON.parse(JSON.stringify(source)), NOW),
      "camp2",
      ids.newId,
      new Map([["boris", "boris2"]]),
    );
    const main = out.lanes.find((l) => l.kind === "main");
    const personal = out.lanes.find((l) => l.kind === "personal");
    expect(personal).toMatchObject({ characterId: "boris2", hidden: true, campaignId: "camp2" });
    expect(out.lanes.every((l) => l.id.startsWith("id"))).toBe(true);

    const [e1, e2, e3] = out.events;
    expect(e1).toMatchObject({ laneId: main?.id, characterIds: ["boris2"], tags: ["бой"] });
    expect(e2).toMatchObject({ laneId: personal?.id, session: null, status: "happened" });
    // An event of a lost lane goes to the main lane.
    expect(e3?.laneId).toBe(main?.id);

    expect(out.links).toHaveLength(1);
    expect(out.links[0]).toMatchObject({ fromId: e1?.id, toId: e2?.id, campaignId: "camp2" });
    expect(out.markers[0]).toMatchObject({ label: "1492", level: 2, campaignId: "camp2" });
    expect(out.markers[0]?.id).not.toBe("m1");
  });

  it("clears the character of a personal lane when the character is not imported", () => {
    const out = remapTimeline(source, "c", idSource().newId, new Map());
    expect(out.lanes.find((l) => l.kind === "personal")?.characterId).toBeNull();
  });
});
