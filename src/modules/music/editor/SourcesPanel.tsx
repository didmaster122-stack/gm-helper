import { useEffect, useRef } from "react";
import { LoaderCircle, Play, Plus, Square, X } from "lucide-react";
import { ru } from "../../../shared/i18n/ru";
import { Button, IconButton, useThemeColor } from "../../../shared/ui";
import { getDecoded } from "./audio";
import { prepareCanvas, useElementWidth, drawPeaks } from "./canvas";
import { LANE_COUNT, MAX_SOURCES, removeSource, type EditorSource } from "./domain/project";
import { formatTime } from "./domain/timeScale";
import { useEditorStore, useProject } from "./store";

const t = ru.music.editor;
const WAVE_H = 56;
/** A press that moves less than this is a click, not a selection. */
const CLICK_PX = 3;

export function SourcesPanel({ onAdd }: { onAdd: () => void }) {
  const sources = useProject().sources;
  const loading = useEditorStore((s) => s.loading);
  const full = sources.length + loading.length >= MAX_SOURCES;

  return (
    <section className="editor-sources">
      <div className="editor-sources-head">
        <h3 className="subheading">{t.sources(sources.length, MAX_SOURCES)}</h3>
        <Button size="sm" variant="ghost" icon={Plus} onClick={onAdd} disabled={full}>
          {t.addSource}
        </Button>
      </div>
      {sources.map((source) => (
        <SourceRow key={source.id} source={source} />
      ))}
      {loading.map((id) => (
        <div key={id} className="source-row loading">
          <LoaderCircle className="spinning" aria-hidden />
          <span>{t.loading}</span>
        </div>
      ))}
    </section>
  );
}

function SourceRow({ source }: { source: EditorSource }) {
  const fragment = useEditorStore((s) => (s.fragment?.sourceId === source.id ? s.fragment : null));
  const previewing = useEditorStore(
    (s) => s.playback?.kind === "source" && s.playback.sourceId === source.id,
  );
  const setFragment = useEditorStore((s) => s.setFragment);
  const playFragment = useEditorStore((s) => s.playFragment);
  const placeFragment = useEditorStore((s) => s.placeFragment);
  const edit = useEditorStore((s) => s.edit);

  return (
    <div className="source-row">
      <div className="source-head">
        <strong title={source.relPath}>{source.title}</strong>
        <span className="muted">{formatTime(source.duration)}</span>
        {fragment ? (
          <>
            <span className="source-fragment">
              {t.fragment(
                formatTime(fragment.from, true),
                formatTime(fragment.to, true),
                formatTime(fragment.to - fragment.from, true),
              )}
            </span>
            <IconButton
              icon={previewing ? Square : Play}
              size="sm"
              label={previewing ? t.stopFragment : t.playFragment}
              onClick={playFragment}
            />
            <span className="source-lanes" title={t.toLaneHint}>
              <span className="muted">{t.toLaneLabel}</span>
              {Array.from({ length: LANE_COUNT }, (_, lane) => (
                <Button
                  key={lane}
                  size="sm"
                  title={t.toLane(lane + 1)}
                  onClick={() => placeFragment(lane)}
                >
                  {lane + 1}
                </Button>
              ))}
            </span>
          </>
        ) : (
          <span className="muted">{t.fragmentHint}</span>
        )}
        <IconButton
          icon={X}
          size="sm"
          label={t.removeSource}
          onClick={() => edit((p) => removeSource(p, source.id))}
        />
      </div>
      <SourceWave
        source={source}
        onSelect={(from, to) => setFragment({ sourceId: source.id, from, to })}
      />
    </div>
  );
}

function SourceWave({
  source,
  onSelect,
}: {
  source: EditorSource;
  onSelect: (from: number, to: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useElementWidth(wrapRef);
  const fragment = useEditorStore((s) => (s.fragment?.sourceId === source.id ? s.fragment : null));
  const preview = useEditorStore((s) =>
    s.playback?.kind === "source" && s.playback.sourceId === source.id ? s.position : null,
  );
  const colors = {
    bg: useThemeColor("--surface-2"),
    wave: useThemeColor("--text-subtle"),
    waveSelected: useThemeColor("--accent-text"),
    selection: useThemeColor("--accent-soft"),
    accent: useThemeColor("--accent"),
  };
  const drag = useRef<{ x: number; time: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = getDecoded(source.id);
    if (!canvas || width === 0) return;
    const ctx = prepareCanvas(canvas, width, WAVE_H);
    if (!ctx) return;
    const perPx = source.duration / width;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, WAVE_H);
    const box = { x: 0, y: 2, width, height: WAVE_H - 4 };
    if (fragment) {
      const x0 = fragment.from / perPx;
      const x1 = fragment.to / perPx;
      ctx.fillStyle = colors.selection;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), WAVE_H);
      if (audio) {
        ctx.fillStyle = colors.wave;
        drawPeaks(ctx, audio.peaks, box, 0, perPx, 0, x0);
        drawPeaks(ctx, audio.peaks, box, 0, perPx, x1, width);
        ctx.fillStyle = colors.waveSelected;
        drawPeaks(ctx, audio.peaks, box, 0, perPx, x0, x1);
      }
      ctx.fillStyle = colors.accent;
      ctx.fillRect(Math.round(x0), 0, 1, WAVE_H);
      ctx.fillRect(Math.round(x1) - 1, 0, 1, WAVE_H);
    } else if (audio) {
      ctx.fillStyle = colors.wave;
      drawPeaks(ctx, audio.peaks, box, 0, perPx);
    }
    if (preview !== null) {
      ctx.fillStyle = colors.accent;
      ctx.fillRect(Math.round(preview / perPx), 0, 2, WAVE_H);
    }
  }, [
    width,
    source,
    fragment,
    preview,
    colors.bg,
    colors.wave,
    colors.waveSelected,
    colors.selection,
    colors.accent,
  ]);

  const timeAt = (clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * source.duration;
  };

  return (
    <div ref={wrapRef} className="source-wave">
      <canvas
        ref={canvasRef}
        style={{ width, height: WAVE_H }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, time: timeAt(e.clientX) };
        }}
        onPointerMove={(e) => {
          const start = drag.current;
          if (!start || Math.abs(e.clientX - start.x) < CLICK_PX) return;
          const time = timeAt(e.clientX);
          onSelect(Math.min(start.time, time), Math.max(start.time, time));
        }}
        onPointerUp={(e) => {
          const start = drag.current;
          drag.current = null;
          // A click selects the whole source again.
          if (start && Math.abs(e.clientX - start.x) < CLICK_PX) onSelect(0, source.duration);
        }}
      />
    </div>
  );
}
