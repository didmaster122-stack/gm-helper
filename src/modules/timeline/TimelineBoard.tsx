import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { ru } from "../../shared/i18n/ru";
import {
  anchorAt,
  anchorY,
  AXIS_OFFSET,
  cardAt,
  clampZoom,
  HEADER_H,
  insertY,
  layoutTimeline,
  linkPath,
  MARKERS_W,
  placeAt,
  SESSIONS_W,
  textScale,
  type Anchor,
  type Box,
  type Place,
} from "./domain/layout";
import { addLink, canLink, moveItem, type ItemRef } from "./domain/timeline";
import type { Lane, Timeline, TimelineEvent } from "./domain/types";
import { useTimelineStore } from "./store";

interface TimelineBoardProps {
  timeline: Timeline;
  /** Lanes shown as columns, in order. */
  lanes: readonly Lane[];
  /** Events that pass the filters. */
  events: readonly TimelineEvent[];
  laneNames: Map<string, string>;
  characterNames: Map<string, string>;
  /** Double click on an empty place of a lane. */
  onCreateEvent: (place: Place) => void;
  /** Double click on the time axis. */
  onCreateMarker: (place: Place) => void;
}

/** A mouse action in progress. Positions are in the lane area (see `domain/layout`). */
type Gesture =
  | { kind: "pan"; startX: number; startY: number; left: number; top: number; moved: boolean }
  | {
      kind: "drag";
      item: ItemRef;
      /** Where the card was grabbed, relative to its top-left corner. */
      grabX: number;
      grabY: number;
      startX: number;
      startY: number;
      x: number;
      y: number;
      moved: boolean;
    }
  | { kind: "connect"; fromId: string; x: number; y: number };

/** Moving the pointer this far turns a click into a drag. */
const DRAG_THRESHOLD = 4;
/** Distance from the edge of the view where dragging scrolls it. */
const EDGE = 40;

// Zoom is kept while the user switches between screens.
let savedZoom = 1;

export function TimelineBoard({
  timeline,
  lanes,
  events,
  laneNames,
  characterNames,
  onCreateEvent,
  onCreateMarker,
}: TimelineBoardProps) {
  const selection = useTimelineStore((s) => s.selection);
  const focusId = useTimelineStore((s) => s.focusId);
  const select = useTimelineStore((s) => s.select);
  const setFocus = useTimelineStore((s) => s.setFocus);
  const edit = useTimelineStore((s) => s.edit);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(0);
  const [zoom, setZoomState] = useState(savedZoom);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  /** Item and screen point to keep in place after a zoom. */
  const pendingAnchor = useRef<{ anchor: Anchor; ratio: number; mx: number; my: number } | null>(
    null,
  );

  const shown = useMemo(() => new Set(events.map((e) => e.id)), [events]);
  const layout = useMemo(
    () => layoutTimeline(timeline, lanes, shown, { viewWidth, zoom }),
    [timeline, lanes, shown, viewWidth, zoom],
  );
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  function updateGesture(g: Gesture | null) {
    gestureRef.current = g;
    setGesture(g);
  }

  // The lanes fill the width of the view.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewWidth(element.clientWidth));
    observer.observe(element);
    setViewWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  /** Zooms keeping the point (clientX, clientY) of the screen over the same item. */
  const zoomTo = useCallback((next: number, clientX?: number, clientY?: number) => {
    const scroll = scrollRef.current;
    const body = bodyRef.current;
    const z = clampZoom(next);
    if (!scroll || !body || z === layoutRef.current.zoom) return;
    const view = scroll.getBoundingClientRect();
    const rect = body.getBoundingClientRect();
    const cx = clientX ?? view.left + view.width / 2;
    const cy = clientY ?? view.top + view.height / 2;
    const anchor = anchorAt(layoutRef.current, cy - rect.top);
    if (anchor) {
      pendingAnchor.current = {
        anchor,
        ratio: (cx - rect.left) / layoutRef.current.lanesWidth,
        mx: cx - view.left,
        my: cy - view.top,
      };
    }
    savedZoom = z;
    setZoomState(z);
  }, []);

  useLayoutEffect(() => {
    const pending = pendingAnchor.current;
    const scroll = scrollRef.current;
    if (!pending || !scroll) return;
    pendingAnchor.current = null;
    const y = anchorY(layout, pending.anchor);
    if (y !== null) scroll.scrollTop = HEADER_H + y - pending.my;
    scroll.scrollLeft = SESSIONS_W + pending.ratio * layout.lanesWidth - pending.mx;
  }, [layout]);

  // Ctrl + wheel zooms; the plain wheel scrolls as usual.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(layoutRef.current.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  // Scroll to an event or a marker asked for from elsewhere.
  useEffect(() => {
    if (!focusId) return;
    const scroll = scrollRef.current;
    const box = layout.cards.get(focusId);
    const middle = box ? box.y + box.height / 2 : layout.markers.get(focusId);
    setFocus(null);
    if (!scroll || middle === undefined) return;
    let left = scroll.scrollLeft;
    if (box) {
      const visible = scroll.clientWidth - SESSIONS_W - MARKERS_W;
      if (box.x < left || box.x + box.width > left + visible) {
        left = box.x - (visible - box.width) / 2;
      }
    }
    scroll.scrollTo({ top: HEADER_H + middle - scroll.clientHeight / 2, left, behavior: "smooth" });
  }, [focusId, layout, setFocus]);

  /** Pointer position in the lane area. */
  function toBody(clientX: number, clientY: number) {
    const rect = bodyRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: 0, y: 0 };
  }

  /** Moves the gesture to the last pointer position (after a move or a scroll). */
  const follow = useCallback(() => {
    const g = gestureRef.current;
    if (!g || g.kind === "pan") return;
    const rect = bodyRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = pointer.current.x - rect.left;
    const y = pointer.current.y - rect.top;
    if (g.kind === "connect") {
      updateGesture({ ...g, x, y });
      return;
    }
    const moved = g.moved || Math.hypot(x - g.startX, y - g.startY) > DRAG_THRESHOLD;
    updateGesture({ ...g, x, y, moved });
  }, []);

  // While dragging near an edge, the view scrolls by itself.
  const autoScroll =
    gesture?.kind === "connect"
      ? "both"
      : gesture?.kind === "drag" && gesture.moved
        ? gesture.item.kind === "event"
          ? "both"
          : "vertical"
        : null;
  useEffect(() => {
    if (!autoScroll) return;
    let frame = 0;
    // Faster closer to the edge (and past it), at most EDGE / 3 pixels a frame.
    const speed = (d: number) => (d < EDGE ? Math.ceil((EDGE - Math.max(d, 0)) / 3) : 0);
    const step = () => {
      const scroll = scrollRef.current;
      if (scroll) {
        const r = scroll.getBoundingClientRect();
        const { x, y } = pointer.current;
        const dy = speed(r.bottom - y) - speed(y - r.top - HEADER_H);
        const dx =
          autoScroll === "both"
            ? speed(r.right - MARKERS_W - x) - speed(x - r.left - SESSIONS_W)
            : 0;
        if (dx !== 0 || dy !== 0) {
          scroll.scrollBy(dx, dy);
          follow();
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [autoScroll, follow]);

  function capture(e: PointerEvent) {
    e.stopPropagation();
    scrollRef.current?.setPointerCapture(e.pointerId);
    pointer.current = { x: e.clientX, y: e.clientY };
  }

  function startDrag(e: PointerEvent, item: ItemRef, box: Box) {
    if (e.button !== 0) return;
    capture(e);
    const p = toBody(e.clientX, e.clientY);
    updateGesture({
      kind: "drag",
      item,
      grabX: p.x - box.x,
      grabY: p.y - box.y,
      startX: p.x,
      startY: p.y,
      x: p.x,
      y: p.y,
      moved: false,
    });
  }

  function startConnect(e: PointerEvent, fromId: string) {
    if (e.button !== 0) return;
    capture(e);
    updateGesture({ kind: "connect", fromId, ...toBody(e.clientX, e.clientY) });
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Background: pan the view.
    const scroll = scrollRef.current;
    if (!scroll || e.button !== 0) return;
    // Leave the scroll bars alone.
    const rect = scroll.getBoundingClientRect();
    if (
      e.clientX - rect.left >= scroll.clientWidth ||
      e.clientY - rect.top >= scroll.clientHeight
    ) {
      return;
    }
    scroll.setPointerCapture(e.pointerId);
    updateGesture({
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      left: scroll.scrollLeft,
      top: scroll.scrollTop,
      moved: false,
    });
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    if (g.kind === "pan") {
      const scroll = scrollRef.current;
      if (!scroll) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      scroll.scrollLeft = g.left - dx;
      scroll.scrollTop = g.top - dy;
      if (!g.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) updateGesture({ ...g, moved: true });
      return;
    }
    follow();
  }

  /** Where the dragged item would land. */
  function dropPlace(g: Extract<Gesture, { kind: "drag" }>): Place | null {
    if (g.item.kind === "marker") return placeAt(layout, 0, g.y - g.grabY + 12, g.item.id);
    const box = layout.cards.get(g.item.id);
    const w = box?.width ?? 0;
    const h = box?.height ?? 0;
    return placeAt(layout, g.x - g.grabX + w / 2, g.y - g.grabY + h / 2, g.item.id);
  }

  function onPointerUp() {
    const g = gestureRef.current;
    updateGesture(null);
    if (!g) return;
    if (g.kind === "pan") {
      if (!g.moved) select(null);
      return;
    }
    if (g.kind === "connect") {
      const target = cardAt(layout, g.x, g.y);
      if (target && canLink(timeline, g.fromId, target)) {
        const fromId = g.fromId;
        edit((t, src) =>
          addLink(t, {
            id: src.newId(),
            campaignId: src.campaignId,
            fromId,
            toId: target,
            createdAt: src.now,
            updatedAt: src.now,
          }),
        );
      }
      return;
    }
    if (!g.moved) {
      select(g.item);
      return;
    }
    const place = dropPlace(g);
    if (!place) return;
    const item = g.item;
    const laneId = item.kind === "event" ? (place.laneId ?? undefined) : undefined;
    select(item);
    edit((t, src) => moveItem(t, item, place.session, place.beforeId, src.now, laneId));
  }

  function onDoubleClick(e: MouseEvent<HTMLDivElement>) {
    const body = bodyRef.current?.getBoundingClientRect();
    if (!body) return;
    const x = e.clientX - body.left;
    const y = e.clientY - body.top;
    if (y < 0 || y > layout.height) return;
    if (x >= layout.lanesWidth) {
      const onMarker = [...layout.markers.values()].some((m) => Math.abs(m - y) < 12);
      if (x < layout.lanesWidth + MARKERS_W && !onMarker) {
        const place = placeAt(layout, 0, y);
        if (place) onCreateMarker(place);
      }
      return;
    }
    if (x < 0 || cardAt(layout, x, y)) return;
    const place = placeAt(layout, x, y);
    if (place) onCreateEvent(place);
  }

  // ---- What to draw ----

  const drag = gesture?.kind === "drag" && gesture.moved ? gesture : null;
  const connect = gesture?.kind === "connect" ? gesture : null;
  const place = drag ? dropPlace(drag) : null;
  const dropY = drag && place ? insertY(layout, place, drag.item.id) : null;
  const dropColumn =
    drag?.item.kind === "event" && place
      ? layout.columns.find((c) => c.lane.id === place.laneId)
      : undefined;
  const connectTarget = connect ? cardAt(layout, connect.x, connect.y) : null;

  /** Box of a card as drawn (the dragged one follows the pointer). */
  const drawnBox = (id: string): Box | undefined => {
    const box = layout.cards.get(id);
    if (!box || drag?.item.id !== id) return box;
    return { ...box, x: drag.x - drag.grabX, y: drag.y - drag.grabY };
  };

  const isSelected = (kind: string, id: string) => selection?.kind === kind && selection.id === id;
  const fromBox = connect ? layout.cards.get(connect.fromId) : undefined;
  const totalWidth = SESSIONS_W + layout.lanesWidth + MARKERS_W;
  const t = ru.timeline;

  return (
    <>
      <div
        className={gesture?.kind === "pan" && gesture.moved ? "tl-scroll panning" : "tl-scroll"}
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => updateGesture(null)}
        onScroll={follow}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="tl-content"
          style={{
            width: totalWidth,
            gridTemplateColumns: `${SESSIONS_W}px ${layout.lanesWidth}px ${MARKERS_W}px`,
            gridTemplateRows: `${HEADER_H}px ${layout.height}px`,
          }}
        >
          <div className="tl-corner left muted">{t.sessionsHeader}</div>
          <div className="tl-head">
            {layout.columns.map((col) => (
              <div
                key={col.lane.id}
                className={`tl-head-cell kind-${col.lane.kind}`}
                style={{ left: col.x, width: col.width }}
                title={laneNames.get(col.lane.id)}
              >
                {laneNames.get(col.lane.id) ?? ""}
              </div>
            ))}
          </div>
          <div className="tl-corner right muted">{t.timeHeader}</div>

          <div className="tl-sessions">
            {layout.bands.map((band) => {
              const current = band.session !== null && band.session === timeline.currentSession;
              const classes = ["tl-bracket"];
              if (band.session === null) classes.push("future");
              if (current) classes.push("current");
              return (
                <div
                  key={band.session ?? "future"}
                  className={classes.join(" ")}
                  style={{ top: band.y + 6, height: band.height - 12 }}
                >
                  <span>{band.session === null ? t.future : t.session(band.session)}</span>
                  {current && <small>{t.current}</small>}
                </div>
              );
            })}
          </div>

          <div
            className="tl-lanes"
            ref={bodyRef}
            style={{ "--tl-scale": textScale(layout.zoom) } as CSSProperties}
          >
            {layout.bands.map((band, i) => {
              const classes = ["tl-band"];
              if (i % 2 === 1) classes.push("odd");
              if (band.session !== null && band.session === timeline.currentSession) {
                classes.push("current");
              }
              return (
                <div
                  key={band.session ?? "future"}
                  className={classes.join(" ")}
                  style={{ top: band.y, height: band.height }}
                />
              );
            })}
            {layout.columns.map((col) => (
              <div
                key={col.lane.id}
                className={col === dropColumn ? "tl-column drop" : "tl-column"}
                style={{ left: col.x, width: col.width }}
              />
            ))}
            {timeline.markers.map((m) => {
              const y = layout.markers.get(m.id);
              return m.level === 1 && y !== undefined ? (
                <div key={m.id} className="tl-marker-line" style={{ top: y }} />
              ) : null;
            })}

            <svg className="tl-links" width={layout.lanesWidth} height={layout.height}>
              <defs>
                <marker
                  id="tl-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" className="tl-arrow-head" />
                </marker>
                <marker
                  id="tl-arrow-selected"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" className="tl-arrow-head selected" />
                </marker>
              </defs>
              {timeline.links.map((l) => {
                const from = drawnBox(l.fromId);
                const to = drawnBox(l.toId);
                if (!from || !to) return null;
                const d = linkPath(from, to);
                const selected = isSelected("link", l.id);
                return (
                  <g key={l.id}>
                    <path
                      d={d}
                      className="tl-link-hit"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        select({ kind: "link", id: l.id });
                      }}
                    />
                    <path
                      d={d}
                      className={selected ? "tl-link selected" : "tl-link"}
                      markerEnd={`url(#${selected ? "tl-arrow-selected" : "tl-arrow"})`}
                    />
                  </g>
                );
              })}
              {connect && fromBox && (
                <path
                  d={linkPath(fromBox, { x: connect.x, y: connect.y, width: 0, height: 0 })}
                  className="tl-link drawing"
                  markerEnd="url(#tl-arrow-selected)"
                />
              )}
            </svg>

            {events.map((e) => {
              const box = drawnBox(e.id);
              if (!box) return null;
              const classes = [
                "tl-event",
                `status-${e.status}`,
                `importance-${e.importance}`,
                `detail-${layout.detail}`,
              ];
              if (isSelected("event", e.id)) classes.push("selected");
              if (drag?.item.id === e.id) classes.push("dragging");
              if (connectTarget === e.id && connect?.fromId !== e.id) classes.push("link-target");
              const meta = [
                e.gameDate,
                e.characterIds.flatMap((id) => characterNames.get(id) ?? []).join(", "),
              ]
                .filter((s) => s !== "")
                .join(" · ");
              return (
                <div
                  key={e.id}
                  className={classes.join(" ")}
                  style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
                  title={`${e.title} · ${t.statuses[e.status]}`}
                  onPointerDown={(ev) => startDrag(ev, { kind: "event", id: e.id }, box)}
                  onDoubleClick={(ev) => ev.stopPropagation()}
                >
                  <div className="tl-event-title">{e.title}</div>
                  {layout.detail === "full" && meta && <div className="tl-event-meta">{meta}</div>}
                  <div
                    className="tl-handle"
                    title={t.connectHint}
                    onPointerDown={(ev) => startConnect(ev, e.id)}
                  />
                </div>
              );
            })}

            {dropColumn && dropY !== null && (
              <div
                className="tl-drop"
                style={{ left: dropColumn.x + 6, top: dropY - 2, width: dropColumn.width - 12 }}
              />
            )}
          </div>

          <div className="tl-times">
            <div className="tl-axis" style={{ left: AXIS_OFFSET }} />
            {timeline.markers.map((m) => {
              const middle = layout.markers.get(m.id);
              if (middle === undefined) return null;
              const dragged = drag?.item.id === m.id;
              const y = dragged ? drag.y - drag.grabY + 12 : middle;
              const classes = ["tl-marker", `level-${m.level}`];
              if (isSelected("marker", m.id)) classes.push("selected");
              if (dragged) classes.push("dragging");
              const box = { x: 0, y: middle - 12, width: MARKERS_W, height: 24 };
              return (
                <div
                  key={m.id}
                  className={classes.join(" ")}
                  style={{ top: y - 12 }}
                  title={m.label}
                  onPointerDown={(ev) => startDrag(ev, { kind: "marker", id: m.id }, box)}
                  onDoubleClick={(ev) => ev.stopPropagation()}
                >
                  <span className="tl-marker-tick" style={{ left: AXIS_OFFSET - 7 }} />
                  <span className="tl-marker-label">{m.label}</span>
                </div>
              );
            })}
            {drag?.item.kind === "marker" && dropY !== null && (
              <div className="tl-drop" style={{ left: 6, top: dropY - 2, width: MARKERS_W - 12 }} />
            )}
          </div>
        </div>
      </div>
      <ZoomControls zoom={layout.zoom} onZoom={(z) => zoomTo(z)} />
    </>
  );
}

function ZoomControls({ zoom, onZoom }: { zoom: number; onZoom: (zoom: number) => void }) {
  const t = ru.timeline.zoom;
  return (
    <div className="tl-zoom" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" title={t.out} aria-label={t.out} onClick={() => onZoom(zoom / 1.25)}>
        −
      </button>
      <button type="button" title={t.reset} onClick={() => onZoom(1)}>
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" title={t.in} aria-label={t.in} onClick={() => onZoom(zoom * 1.25)}>
        +
      </button>
    </div>
  );
}
