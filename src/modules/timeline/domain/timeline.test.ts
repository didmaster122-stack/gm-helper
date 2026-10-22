import { describe, expect, it } from "vitest";
import { eventVisible, noFilter, visibleEvents } from "./filter";
import {
  anchorAt,
  anchorY,
  cardAt,
  layoutTimeline,
  markerVisible,
  MARKERS_W,
  MIN_COL_W,
  placeAt,
  SESSIONS_W,
} from "./layout";
import { event, idSource, lane, link, marker, timeline } from "./testing";
import {
  addEvent,
  addLink,
  addPersonalLane,
  charactersWithoutLane,
  insertEvent,
  insertMarker,
  moveItem,
  removeMarker,
  sessionItems,
  ensureDefaults,
  lanesInOrder,
  moveEvent,
  moveLane,
  putRecapEvent,
  removeEvent,
  removeLane,
  removeLastSession,
  setCurrentSession,
  shownLanes,
  updateEvent,
} from "./timeline";
import { emptyTimeline } from "./types";

const NOW = "2026-10-21T00:00:00.000Z";
const ids = (list: readonly { id: string }[]) => list.map((x) => x.id);
const order = (t: Parameters<typeof sessionItems>[0], session: number | null) =>
  ids(sessionItems(t, session));

describe("defaults and personal lanes", () => {
  it("gives a new timeline the main lane, a side lane and one session", () => {
    const t = ensureDefaults(emptyTimeline, "Побочные квесты", idSource());
    expect(t.lanes.map((l) => [l.kind, l.name, l.sort])).toEqual([
      ["main", "", 0],
      ["custom", "Побочные квесты", 1],
    ]);
    expect(t.sessionCount).toBe(1);
    expect(t.currentSession).toBe(1);
    expect(ensureDefaults(t, "x", idSource())).toBe(t);
  });

  it("restores a missing main lane in front", () => {
    const t = ensureDefaults(timeline({ lanes: [lane("side")] }), "x", idSource());
    expect(lanesInOrder(t).map((l) => l.kind)).toEqual(["main", "custom"]);
  });

  it("adds a personal lane only when asked, once per player character", () => {
    const t = timeline();
    const arya = { id: "a", name: "Арья", isPc: true };
    const chars = [arya, { id: "b", name: "Борис", isPc: false }];
    expect(charactersWithoutLane(t, chars)).toEqual([arya]);
    const next = addPersonalLane(t, arya, idSource());
    expect(next.lanes.map((l) => [l.kind, l.characterId, l.name, l.sort]).at(-1)).toEqual([
      "personal",
      "a",
      "Арья",
      2,
    ]);
    expect(charactersWithoutLane(next, chars)).toEqual([]);
    expect(addPersonalLane(next, arya, idSource())).toBe(next);
  });

  it("removes a personal lane like a custom one", () => {
    const personal = lane("p", { kind: "personal", characterId: "a", sort: 2 });
    const t = timeline({
      lanes: [...timeline().lanes, personal],
      events: [event("e", { laneId: "p" })],
    });
    const next = removeLane(t, "p", NOW);
    expect(ids(next.lanes)).toEqual(["main", "side"]);
    expect(next.events[0]?.laneId).toBe("main");
  });

  it("hides the personal lane of a former player character unless it has events", () => {
    const personal = lane("p", { kind: "personal", characterId: "a", sort: 5 });
    const t = timeline({ lanes: [...timeline().lanes, personal] });
    const npc = [{ id: "a", name: "A", isPc: false }];
    expect(ids(shownLanes(t, npc))).toEqual(["main", "side"]);
    expect(ids(shownLanes(t, [{ id: "a", name: "A", isPc: true }]))).toEqual(["main", "side", "p"]);
    const used = { ...t, events: [event("e", { laneId: "p" })] };
    expect(ids(shownLanes(used, []))).toEqual(["main", "side", "p"]);
  });
});

describe("events", () => {
  it("adds an event at the end of its session, whatever the lane", () => {
    let t = timeline();
    t = addEvent(t, event("a"));
    t = addEvent(t, event("b", { laneId: "side" }));
    t = addEvent(t, event("c", { session: 2 }));
    t = insertEvent(t, event("d"), "b");
    expect(order(t, 1)).toEqual(["a", "d", "b"]);
    expect(t.events.find((e) => e.id === "c")?.sort).toBe(0);
  });

  it("updates only on a real change", () => {
    const t = timeline({ events: [event("a", { tags: ["x"] })] });
    expect(updateEvent(t, "a", { tags: ["x"] }, NOW)).toBe(t);
    const next = updateEvent(t, "a", { status: "happened" }, NOW);
    expect(next.events[0]).toMatchObject({ status: "happened", updatedAt: NOW });
  });

  it("removes an event with its links", () => {
    const t = timeline({
      events: [event("a"), event("b"), event("c")],
      links: [link("l1", "a", "b"), link("l2", "b", "c"), link("l3", "a", "c")],
    });
    expect(ids(removeEvent(t, "b").links)).toEqual(["l3"]);
  });

  it("moves an event inside its session", () => {
    const t = timeline({
      events: [event("a", { sort: 0 }), event("b", { sort: 1 }), event("c", { sort: 2 })],
    });
    const next = moveEvent(t, "c", "main", 1, "a", NOW);
    expect(order(next, 1)).toEqual(["c", "a", "b"]);
    expect(order(moveEvent(t, "a", "main", 1, null, NOW), 1)).toEqual(["b", "c", "a"]);
    expect(moveEvent(t, "a", "main", 1, "b", NOW)).toBe(t);
  });

  it("moves an event to another lane and session", () => {
    const t = timeline({
      events: [event("a"), event("x", { laneId: "side", session: null, sort: 0 })],
    });
    const next = moveEvent(t, "a", "side", null, "x", NOW);
    expect(order(next, null)).toEqual(["a", "x"]);
    expect(next.events.find((e) => e.id === "a")).toMatchObject({
      laneId: "side",
      session: null,
      updatedAt: NOW,
    });
  });

  it("links cause and consequence once, across lanes too", () => {
    const t = timeline({ events: [event("a"), event("b", { laneId: "side" })] });
    const next = addLink(t, link("l", "a", "b"));
    expect(next.links).toHaveLength(1);
    expect(addLink(next, link("l2", "a", "b"))).toBe(next);
    expect(addLink(t, link("l3", "a", "a"))).toBe(t);
    expect(addLink(t, link("l4", "a", "missing"))).toBe(t);
  });
});

describe("sessions and lanes", () => {
  it("moves the events of a removed session to the future", () => {
    const t = timeline({
      currentSession: 3,
      events: [
        event("a", { session: 3, sort: 0 }),
        event("b", { session: 3, sort: 1 }),
        event("f", { session: null, sort: 0 }),
      ],
    });
    const next = removeLastSession(t, NOW);
    expect(next.sessionCount).toBe(2);
    expect(next.currentSession).toBe(2);
    expect(order(next, null)).toEqual(["f", "a", "b"]);
  });

  it("keeps the current session within the sessions", () => {
    const t = timeline();
    expect(setCurrentSession(t, 4)).toBe(t);
    expect(setCurrentSession(t, 3).currentSession).toBe(3);
    expect(setCurrentSession(t, null).currentSession).toBeNull();
  });

  it("swaps a lane with its shown neighbour", () => {
    const t = timeline({
      lanes: [
        lane("main", { kind: "main", sort: 0 }),
        lane("hidden", { kind: "personal", characterId: "gone", sort: 1 }),
        lane("side", { sort: 2 }),
      ],
    });
    const order = shownLanes(t, []);
    const next = moveLane(t, order, "side", -1, NOW);
    expect(ids(lanesInOrder(next))).toEqual(["side", "main", "hidden"]);
    expect(moveLane(t, order, "main", -1, NOW)).toBe(t);
  });

  it("moves events of a removed lane to the main lane", () => {
    const t = timeline({
      events: [event("m", { sort: 0 }), event("s", { laneId: "side", sort: 1 })],
    });
    const next = removeLane(t, "side", NOW);
    expect(ids(next.lanes)).toEqual(["main"]);
    expect(next.events.map((e) => [e.id, e.laneId])).toEqual([
      ["m", "main"],
      ["s", "main"],
    ]);
    expect(order(next, 1)).toEqual(["m", "s"]);
    expect(removeLane(t, "main", NOW)).toBe(t);
  });
});

describe("time markers", () => {
  it("share the order of the session with events", () => {
    let t = timeline({ events: [event("a", { sort: 0 }), event("b", { sort: 1 })] });
    t = insertMarker(t, marker("m"), "b");
    expect(order(t, 1)).toEqual(["a", "m", "b"]);
    t = moveItem(t, { kind: "marker", id: "m" }, 2, null, NOW);
    expect(order(t, 1)).toEqual(["a", "b"]);
    expect(order(t, 2)).toEqual(["m"]);
    expect(order(removeMarker(t, "m"), 2)).toEqual([]);
  });

  it("go to the future with their session", () => {
    const t = timeline({ markers: [marker("m", { session: 3 })] });
    expect(order(removeLastSession(t, NOW), null)).toEqual(["m"]);
  });

  it("show finer levels only when zoomed in", () => {
    expect(markerVisible(1, 0.1)).toBe(true);
    expect(markerVisible(2, 0.3)).toBe(false);
    expect(markerVisible(2, 0.7)).toBe(true);
    expect(markerVisible(3, 0.7)).toBe(false);
    expect(markerVisible(3, 1)).toBe(true);
  });
});

describe("filter", () => {
  it("hides planned events in 'what has happened'", () => {
    const f = { ...noFilter, happenedOnly: true };
    expect(eventVisible(event("a", { status: "planned" }), f)).toBe(false);
    expect(eventVisible(event("a", { status: "failed" }), f)).toBe(true);
  });

  it("filters by lane, status, character and tag", () => {
    const t = timeline({
      events: [
        event("a", { characterIds: ["c1"], tags: ["бой"] }),
        event("b", { laneId: "side", status: "happened" }),
      ],
    });
    expect(ids(visibleEvents(t, { ...noFilter, laneId: "side" }))).toEqual(["b"]);
    expect(ids(visibleEvents(t, { ...noFilter, statuses: new Set(["planned"]) }))).toEqual(["a"]);
    expect(ids(visibleEvents(t, { ...noFilter, characterId: "c1" }))).toEqual(["a"]);
    expect(ids(visibleEvents(t, { ...noFilter, tag: "бой" }))).toEqual(["a"]);
  });
});

describe("layout", () => {
  const t = timeline({
    sessionCount: 2,
    events: [
      event("a", { sort: 0 }),
      event("b", { laneId: "side", sort: 2 }),
      event("c", { session: null }),
    ],
    markers: [marker("m", { sort: 1 }), marker("day", { level: 3, sort: 3 })],
  });
  const all = new Set(t.events.map((e) => e.id));
  const at = (zoom: number, viewWidth = 1000) =>
    layoutTimeline(t, t.lanes, all, { viewWidth, zoom });
  const layout = at(1);

  it("stacks sessions, then 'Future', top to bottom", () => {
    expect(layout.bands.map((b) => b.session)).toEqual([1, 2, null]);
    const [s1, s2, future] = layout.bands;
    expect(s1?.y).toBe(0);
    expect(s2?.y).toBe(s1?.height);
    expect(future?.y).toBe((s2?.y ?? 0) + (s2?.height ?? 0));
    expect(layout.height).toBe((future?.y ?? 0) + (future?.height ?? 0));
    expect(s1?.height).toBeGreaterThan(s2?.height ?? 0);
  });

  it("always fills the visible width, at any zoom", () => {
    expect(layout.lanesWidth).toBe(1000 - SESSIONS_W - MARKERS_W);
    expect(at(0.3).lanesWidth).toBe(layout.lanesWidth);
    expect(at(2).lanesWidth).toBe(layout.lanesWidth);
    // Zooming in makes the cards taller instead.
    expect(at(2).cards.get("a")?.height).toBe(2 * (layout.cards.get("a")?.height ?? 0));
    expect(layout.columns.map((c) => [c.lane.id, c.x])).toEqual([
      ["main", 0],
      ["side", layout.lanesWidth / 2],
    ]);
    // Too narrow: the lanes keep their minimum width.
    expect(at(1, 100).lanesWidth).toBe(2 * MIN_COL_W);
  });

  it("gives every item of a session its own slot in order", () => {
    const a = layout.cards.get("a");
    const b = layout.cards.get("b");
    const m = layout.markers.get("m");
    if (!a || !b || m === undefined) throw new Error("not laid out");
    expect(a.y + a.height).toBeLessThan(m);
    expect(m).toBeLessThan(b.y);
    expect(b.x).toBeGreaterThan(a.x);
    expect(layout.slots[0]?.map((s) => s.id)).toEqual(["a", "m", "b", "day"]);
  });

  it("gets denser and drops fine markers when zoomed out", () => {
    const far = at(0.3);
    expect(far.detail).toBe("bar");
    expect(far.markers.has("day")).toBe(false);
    expect(far.markers.has("m")).toBe(true);
    expect(far.height).toBeLessThan(layout.height);
  });

  it("skips hidden events", () => {
    const hidden = layoutTimeline(t, t.lanes, new Set(["c"]), { viewWidth: 1000, zoom: 1 });
    expect(hidden.cards.has("a")).toBe(false);
    expect(hidden.slots[0]?.map((s) => s.id)).toEqual(["m", "day"]);
  });

  it("finds where an item put at a point goes and the card under it", () => {
    const a = layout.cards.get("a");
    const b = layout.cards.get("b");
    if (!a || !b) throw new Error("not laid out");
    expect(placeAt(layout, a.x + 5, a.y + 2)).toEqual({
      session: 1,
      beforeId: "a",
      laneId: "main",
    });
    expect(placeAt(layout, b.x + 5, b.y + b.height - 2)).toMatchObject({
      beforeId: "day",
      laneId: "side",
    });
    expect(placeAt(layout, a.x, a.y + 2, "a")).toMatchObject({ beforeId: "m" });
    expect(placeAt(layout, -50, 1e6)).toMatchObject({ session: null, laneId: "main" });
    expect(cardAt(layout, b.x + 1, b.y + 1)).toBe("b");
    expect(cardAt(layout, b.x - 1, b.y + 1)).toBeNull();
  });

  it("keeps the item under the pointer when zooming", () => {
    const a = layout.cards.get("a");
    if (!a) throw new Error("not laid out");
    const anchor = anchorAt(layout, a.y + a.height / 2);
    expect(anchor).toEqual({ id: "a", fraction: 0.5 });
    const near = at(2);
    const box = near.cards.get("a");
    if (!anchor || !box) throw new Error("not laid out");
    expect(anchorY(near, anchor)).toBe(box.y + box.height / 2);
    const future = anchorAt(layout, layout.height - 1);
    expect(future?.id).toBe("session:future");
  });
});

describe("session recaps", () => {
  const input = { eventId: null, session: 2, title: "Итоги сессии 2", description: "Победа" };

  it("adds a happened event to the main lane at the end of the session", () => {
    const t = timeline({ events: [event("a", { session: 2, sort: 0 })] });
    const { timeline: next, id } = putRecapEvent(t, input, idSource());
    expect(id).toBe("id1");
    expect(order(next, 2)).toEqual(["a", "id1"]);
    const added = next.events.find((e) => e.id === id);
    expect(added).toMatchObject({ laneId: "main", status: "happened", description: "Победа" });
  });

  it("adds the missing sessions to the timeline", () => {
    const t = timeline({ sessionCount: 1 });
    const { timeline: next } = putRecapEvent(t, { ...input, session: 4 }, idSource());
    expect(next.sessionCount).toBe(4);
    expect(
      putRecapEvent(timeline({ sessionCount: 6 }), input, idSource()).timeline.sessionCount,
    ).toBe(6);
  });

  it("updates the text of the existing event where it is now", () => {
    const t = timeline({ events: [event("r", { session: 1, laneId: "side", description: "x" })] });
    const { timeline: next, id } = putRecapEvent(t, { ...input, eventId: "r" }, idSource());
    expect(id).toBe("r");
    expect(next.events).toEqual([
      expect.objectContaining({ id: "r", session: 1, laneId: "side", description: "Победа" }),
    ]);
    expect(putRecapEvent(next, { ...input, eventId: "r" }, idSource()).timeline).toBe(next);
  });

  it("adds a new event when the old one was deleted", () => {
    const { timeline: next, id } = putRecapEvent(
      timeline(),
      { ...input, eventId: "gone" },
      idSource(),
    );
    expect(id).toBe("id1");
    expect(next.events).toHaveLength(1);
  });
});
