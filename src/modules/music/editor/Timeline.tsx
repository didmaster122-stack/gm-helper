import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { ru } from "../../../shared/i18n/ru";
import { IconButton, useThemeColor } from "../../../shared/ui";
import { getDecoded } from "./audio";
import { drawPeaks, prepareCanvas, useElementWidth } from "./canvas";
import {
  clipEnd,
  LANE_COUNT,
  moveClip,
  projectDuration,
  setLane,
  snapClipStart,
  snapTargets,
  snapTime,
  trimClip,
  type Clip,
  type Project,
} from "./domain/project";
import { clampZoom, formatTime, rulerStep } from "./domain/timeScale";
import { useEditorStore, useProject } from "./store";

const t = ru.music.editor;
const RULER_H = 26;
const LANE_H = 76;
const HEIGHT = RULER_H + LANE_H * LANE_COUNT;
/** Grab zone for trimming at each clip edge. */
const EDGE_PX = 6;
const SNAP_PX = 8;
/** Free room after the last clip, so clips can be dragged further. */
const TAIL_S = 30;

type Hit =
  | { kind: "ruler" }
  | { kind: "lane"; lane: number }
  | { kind: "clip"; clip: Clip; part: "start" | "end" | "body" };

type Gesture =
  | { kind: "cursor" }
  | { kind: "move"; base: Project; clip: Clip; grab: number; changed: boolean }
  | { kind: "trim"; base: Project; clip: Clip; edge: "start" | "end"; changed: boolean };

function hitTest(project: Project, time: number, y: number, zoom: number): Hit {
  if (y < RULER_H) return { kind: "ruler" };
  const lane = Math.min(LANE_COUNT - 1, Math.floor((y - RULER_H) / LANE_H));
  const edge = EDGE_PX / zoom;
  const clip = project.clips.find(
    (c) => c.lane === lane && time >= c.start - edge && time <= clipEnd(c) + edge,
  );
  if (!clip) return { kind: "lane", lane };
  // Short clips keep a body to grab: the edge zones shrink with them.
  const zone = Math.min(edge, clip.length / 3);
  if (time <= clip.start + zone) return { kind: "clip", clip, part: "start" };
  if (time >= clipEnd(clip) - zone) return { kind: "clip", clip, part: "end" };
  return { kind: "clip", clip, part: "body" };
}

function cursorFor(hit: Hit): string {
  if (hit.kind !== "clip") return hit.kind === "ruler" ? "col-resize" : "default";
  return hit.part === "body" ? "grab" : "ew-resize";
}

export function Timeline() {
  const project = useProject();
  const zoom = useEditorStore((s) => s.zoom);
  const cursor = useEditorStore((s) => s.cursor);
  const position = useEditorStore((s) => (s.playback?.kind === "mix" ? s.position : null));
  const selectedId = useEditorStore((s) => s.selectedClipId);
  const activeLane = useEditorStore((s) => s.activeLane);
  const edit = useEditorStore((s) => s.edit);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useElementWidth(scrollRef);
  const [scrollLeft, setScrollLeft] = useState(0);
  const gesture = useRef<Gesture | null>(null);
  const [hover, setHover] = useState("default");
  const volumeFirst = useRef(true);

  function endVolumeDrag() {
    if (volumeFirst.current) return;
    volumeFirst.current = true;
    useEditorStore.getState().endDrag();
  }

  const colors = {
    canvas: useThemeColor("--canvas"),
    ruler: useThemeColor("--surface"),
    border: useThemeColor("--border"),
    tick: useThemeColor("--border-strong"),
    label: useThemeColor("--text-muted"),
    active: useThemeColor("--accent-softer"),
    clip: useThemeColor("--surface-3"),
    clipSelected: useThemeColor("--accent-soft"),
    wave: useThemeColor("--text-subtle"),
    text: useThemeColor("--text"),
    accent: useThemeColor("--accent"),
  };

  const duration = projectDuration(project);
  const contentWidth = Math.max(width, Math.ceil((Math.max(duration, cursor) + TAIL_S) * zoom));
  const playhead = position ?? cursor;

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || position === null || width === 0) return;
    const x = position * zoom;
    if (x < el.scrollLeft || x > el.scrollLeft + width - 24) el.scrollLeft = Math.max(0, x - 40);
  }, [position, zoom, width]);

  // Ctrl + wheel zooms around the mouse; the plain wheel scrolls sideways.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        const { zoom: current, setZoom } = useEditorStore.getState();
        const x = e.clientX - el.getBoundingClientRect().left;
        const time = (el.scrollLeft + x) / current;
        const next = clampZoom(current * Math.exp(-e.deltaY * 0.0015));
        setZoom(next);
        requestAnimationFrame(() => {
          el.scrollLeft = Math.max(0, time * next - x);
        });
      } else {
        el.scrollLeft += e.deltaY + e.deltaX;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const ctx = prepareCanvas(canvas, width, HEIGHT);
    if (!ctx) return;
    const x = (time: number) => time * zoom - scrollLeft;
    const visibleFrom = scrollLeft / zoom;
    const visibleTo = (scrollLeft + width) / zoom;

    ctx.fillStyle = colors.canvas;
    ctx.fillRect(0, 0, width, HEIGHT);
    ctx.fillStyle = colors.active;
    ctx.fillRect(0, RULER_H + activeLane * LANE_H, width, LANE_H);

    // Ruler
    ctx.fillStyle = colors.ruler;
    ctx.fillRect(0, 0, width, RULER_H);
    const step = rulerStep(zoom);
    const minor = step / 5;
    ctx.font = "11px Segoe UI, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (let i = Math.floor(visibleFrom / minor); i * minor <= visibleTo; i++) {
      const time = i * minor;
      const px = Math.round(x(time)) + 0.5;
      const major = i % 5 === 0;
      ctx.fillStyle = colors.tick;
      ctx.fillRect(px - 0.5, major ? 8 : RULER_H - 6, 1, major ? RULER_H - 8 : 6);
      if (major) {
        ctx.fillStyle = colors.label;
        ctx.fillText(formatTime(time, step < 1), px + 4, 12);
      }
    }

    // Lanes
    ctx.fillStyle = colors.border;
    for (let lane = 0; lane <= LANE_COUNT; lane++) {
      ctx.fillRect(0, RULER_H + lane * LANE_H - (lane === 0 ? 1 : 0), width, 1);
    }

    // Clips
    for (const clip of project.clips) {
      const left = x(clip.start);
      const right = x(clipEnd(clip));
      if (right < 0 || left > width) continue;
      const top = RULER_H + clip.lane * LANE_H + 4;
      const h = LANE_H - 8;
      const selected = clip.id === selectedId;
      const lane = project.lanes[clip.lane];
      ctx.globalAlpha = lane?.muted ? 0.45 : 1;
      ctx.fillStyle = selected ? colors.clipSelected : colors.clip;
      ctx.beginPath();
      ctx.roundRect(left, top, right - left, h, 4);
      ctx.fill();
      ctx.save();
      ctx.clip();
      const audio = getDecoded(clip.sourceId);
      if (audio) {
        ctx.fillStyle = colors.wave;
        drawPeaks(
          ctx,
          audio.peaks,
          { x: left, y: top + 18, width: right - left, height: h - 22 },
          clip.offset,
          1 / zoom,
          0,
          width,
        );
      }
      const title = project.sources.find((s) => s.id === clip.sourceId)?.title ?? "";
      ctx.fillStyle = colors.text;
      ctx.fillText(title, Math.max(left, 0) + 6, top + 10);
      ctx.restore();
      ctx.strokeStyle = selected ? colors.accent : colors.tick;
      ctx.lineWidth = selected ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(left + 0.5, top + 0.5, right - left - 1, h - 1, 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Playhead
    const px = Math.round(x(playhead));
    if (px >= -2 && px <= width + 2) {
      ctx.fillStyle = colors.accent;
      ctx.fillRect(px - 1, 0, 2, HEIGHT);
      ctx.beginPath();
      ctx.moveTo(px - 6, 0);
      ctx.lineTo(px + 6, 0);
      ctx.lineTo(px, 8);
      ctx.fill();
    }
  }, [
    project,
    zoom,
    width,
    scrollLeft,
    playhead,
    selectedId,
    activeLane,
    colors.canvas,
    colors.ruler,
    colors.border,
    colors.tick,
    colors.label,
    colors.active,
    colors.clip,
    colors.clipSelected,
    colors.wave,
    colors.text,
    colors.accent,
  ]);

  function pointerTime(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      time: Math.max(0, (e.clientX - rect.left + scrollLeft) / zoom),
      y: e.clientY - rect.top,
    };
  }

  function laneAt(y: number) {
    return Math.min(LANE_COUNT - 1, Math.max(0, Math.floor((y - RULER_H) / LANE_H)));
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const s = useEditorStore.getState();
    const { time, y } = pointerTime(e);
    const hit = hitTest(s.history.present, time, y, zoom);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit.kind === "clip") {
      s.selectClip(hit.clip.id);
      const base = s.history.present;
      gesture.current =
        hit.part === "body"
          ? { kind: "move", base, clip: hit.clip, grab: time - hit.clip.start, changed: false }
          : { kind: "trim", base, clip: hit.clip, edge: hit.part, changed: false };
      if (hit.part === "body") setHover("grabbing");
      return;
    }
    if (hit.kind === "lane") {
      s.setActiveLane(hit.lane);
      s.selectClip(null);
    }
    gesture.current = { kind: "cursor" };
    s.setCursor(time);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = useEditorStore.getState();
    const { time, y } = pointerTime(e);
    const g = gesture.current;
    if (!g) {
      setHover(cursorFor(hitTest(s.history.present, time, y, zoom)));
      return;
    }
    if (g.kind === "cursor") {
      s.setCursor(time);
      return;
    }
    const targets = snapTargets(
      g.base,
      g.clip.id,
      s.playback?.kind === "mix" ? s.position : s.cursor,
    );
    const threshold = SNAP_PX / zoom;
    let next: Project;
    if (g.kind === "move") {
      const start = snapClipStart(time - g.grab, g.clip.length, targets, threshold);
      next = moveClip(g.base, g.clip.id, laneAt(y), start);
    } else {
      next = trimClip(g.base, g.clip.id, g.edge, snapTime(time, targets, threshold) ?? time);
    }
    if (next === s.history.present) return;
    s.drag(next, !g.changed);
    g.changed = true;
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    if (g && g.kind !== "cursor") {
      useEditorStore.getState().endDrag();
      if (g.kind === "move") setHover("grab");
    }
  }

  return (
    <section className="editor-timeline">
      <div className="lane-heads">
        <div className="lane-heads-ruler" style={{ height: RULER_H }} />
        {project.lanes.map((lane, i) => (
          <div
            key={i}
            className={i === activeLane ? "lane-head active" : "lane-head"}
            style={{ height: LANE_H }}
          >
            <span className="lane-name">{t.lane(i + 1)}</span>
            <div className="lane-controls">
              <IconButton
                icon={lane.muted ? VolumeX : Volume2}
                size="sm"
                label={lane.muted ? t.unmute : t.mute}
                active={lane.muted}
                onClick={() => edit((p) => setLane(p, i, { muted: !lane.muted }))}
              />
              <input
                type="range"
                className="volume-bar"
                min={0}
                max={100}
                value={Math.round(lane.volume * 100)}
                aria-label={t.volume}
                title={`${t.volume}: ${Math.round(lane.volume * 100)}%`}
                style={{ "--progress": `${lane.volume * 100}%` } as React.CSSProperties}
                onChange={(e) => {
                  // One undo step per slider drag.
                  const s = useEditorStore.getState();
                  const volume = Number(e.target.value) / 100;
                  const next = setLane(s.history.present, i, { volume });
                  if (next === s.history.present) return;
                  s.drag(next, volumeFirst.current);
                  volumeFirst.current = false;
                }}
                onPointerUp={endVolumeDrag}
                onKeyUp={endVolumeDrag}
                onBlur={endVolumeDrag}
              />
            </div>
          </div>
        ))}
      </div>
      <div
        ref={scrollRef}
        className="timeline-scroll"
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        <div style={{ width: contentWidth, height: HEIGHT }}>
          <canvas
            ref={canvasRef}
            className="timeline-canvas"
            style={{ width, height: HEIGHT, cursor: hover }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => !gesture.current && setHover("default")}
          />
        </div>
      </div>
    </section>
  );
}
