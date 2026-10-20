import { useEffect, useState } from "react";
import {
  AudioWaveform,
  CircleAlert,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Scan,
  Scissors,
  SkipBack,
  Trash,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { ru } from "../../../shared/i18n/ru";
import { Button, EmptyState, IconButton } from "../../../shared/ui";
import {
  addClip,
  clipsAt,
  duplicateClip,
  projectDuration,
  removeClip,
  splitClip,
  type Project,
} from "./domain/project";
import { fitZoom, formatTime } from "./domain/timeScale";
import { SaveDialog } from "./SaveDialog";
import { SourcePicker } from "./SourcePicker";
import { SourcesPanel } from "./SourcesPanel";
import { addTrackToEditor, useEditorStore, useProject } from "./store";
import { Timeline } from "./Timeline";

const t = ru.music.editor;
const ZOOM_STEP = 1.5;
const noop = () => undefined;

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Where cuts and pastes happen: the live position while playing, the cursor otherwise. */
function playhead(): number {
  const s = useEditorStore.getState();
  return s.playback?.kind === "mix" ? s.position : s.cursor;
}

// Clip commands, shared by the toolbar and the keyboard.

function splitAtPlayhead() {
  const s = useEditorStore.getState();
  const time = playhead();
  const under = clipsAt(s.history.present, time);
  // The selected clip if the playhead is on it, otherwise every clip under the playhead.
  const targets = under.some((c) => c.id === s.selectedClipId)
    ? under.filter((c) => c.id === s.selectedClipId)
    : under;
  if (targets.length === 0) return;
  s.edit((p) => targets.reduce((acc, c) => splitClip(acc, c.id, time, crypto.randomUUID()), p));
}

function duplicateSelected() {
  const s = useEditorStore.getState();
  const id = s.selectedClipId;
  if (!id) return;
  const copyId = crypto.randomUUID();
  s.edit((p) => duplicateClip(p, id, copyId));
  s.selectClip(copyId);
}

function copySelected() {
  const s = useEditorStore.getState();
  const clip = s.history.present.clips.find((c) => c.id === s.selectedClipId);
  if (clip) s.setClipboard({ sourceId: clip.sourceId, offset: clip.offset, length: clip.length });
}

function paste() {
  const s = useEditorStore.getState();
  const content = s.clipboard;
  if (!content) return;
  const id = crypto.randomUUID();
  s.edit((p) => addClip(p, id, content, s.activeLane, playhead()));
  s.selectClip(id);
}

function deleteSelected() {
  const s = useEditorStore.getState();
  const id = s.selectedClipId;
  if (!id) return;
  s.edit((p) => removeClip(p, id));
  s.selectClip(null);
}

function zoomBy(factor: number) {
  const s = useEditorStore.getState();
  s.setZoom(s.zoom * factor);
}

function fitAll(project: Project) {
  const el = document.querySelector<HTMLElement>(".timeline-scroll");
  const s = useEditorStore.getState();
  s.setZoom(fitZoom(projectDuration(project) * 1.05, el?.clientWidth ?? 0));
  if (el) el.scrollLeft = 0;
}

export function EditorScreen({ root }: { root: string }) {
  const project = useProject();
  const loading = useEditorStore((s) => s.loading.length);
  const error = useEditorStore((s) => s.error);
  const clearError = useEditorStore((s) => s.clearError);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  // Leaving the editor stops its playback; the project itself stays.
  useEffect(() => () => useEditorStore.getState().stop(), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector(".modal-backdrop")) return;
      const s = useEditorStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      // e.code is layout-independent, so shortcuts also work with the Russian layout.
      const command = ctrl
        ? {
            KeyZ: e.shiftKey ? s.redo : s.undo,
            KeyY: s.redo,
            KeyC: copySelected,
            KeyV: paste,
            KeyD: duplicateSelected,
          }[e.code]
        : e.altKey
          ? undefined
          : ({
              Space: e.repeat ? noop : s.togglePlay,
              KeyS: splitAtPlayhead,
              Delete: deleteSelected,
              Backspace: deleteSelected,
              Home: () => s.setCursor(0),
              End: () => s.setCursor(projectDuration(s.history.present)),
              Equal: () => zoomBy(ZOOM_STEP),
              NumpadAdd: () => zoomBy(ZOOM_STEP),
              Minus: () => zoomBy(1 / ZOOM_STEP),
              NumpadSubtract: () => zoomBy(1 / ZOOM_STEP),
              Escape: () => s.selectClip(null),
            }[e.code] ?? undefined);
      if (!command) return;
      e.preventDefault();
      command();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const empty = project.sources.length === 0 && loading === 0;

  return (
    <section className="music-editor">
      <EditorToolbar
        onSave={() => setSaving(true)}
        onFit={() => fitAll(project)}
        disabled={empty}
      />
      {error && (
        <div className="notice error">
          <CircleAlert aria-hidden />
          <span>{error}</span>
          <IconButton icon={X} size="sm" label={ru.common.close} onClick={clearError} />
        </div>
      )}
      {empty ? (
        <EmptyState
          icon={AudioWaveform}
          title={t.emptyTitle}
          text={t.emptyText}
          action={
            <Button variant="primary" icon={Plus} onClick={() => setPicking(true)}>
              {t.addSource}
            </Button>
          }
        />
      ) : (
        <div className="editor-body">
          <SourcesPanel onAdd={() => setPicking(true)} />
          <Timeline />
          <p className="library-hint">{t.timelineHint}</p>
        </div>
      )}
      {picking && (
        <SourcePicker
          onPick={(track) => {
            addTrackToEditor(root, track);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {saving && <SaveDialog root={root} onClose={() => setSaving(false)} />}
    </section>
  );
}

function EditorToolbar({
  onSave,
  onFit,
  disabled,
}: {
  onSave: () => void;
  onFit: () => void;
  disabled: boolean;
}) {
  const playing = useEditorStore((s) => s.playback?.kind === "mix");
  const time = useEditorStore((s) => (s.playback?.kind === "mix" ? s.position : s.cursor));
  const canUndo = useEditorStore((s) => s.history.past.length > 0);
  const canRedo = useEditorStore((s) => s.history.future.length > 0);
  const selected = useEditorStore((s) => s.selectedClipId !== null);
  const hasClipboard = useEditorStore((s) => s.clipboard !== null);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const setCursor = useEditorStore((s) => s.setCursor);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const duration = projectDuration(useProject());

  return (
    <div className="toolbar editor-toolbar">
      <div className="toolbar-group">
        <IconButton
          icon={playing ? Pause : Play}
          variant="primary"
          label={playing ? t.pause : t.play}
          shortcut="Space"
          onClick={togglePlay}
          disabled={duration <= 0}
        />
        <IconButton
          icon={SkipBack}
          label={t.toStart}
          shortcut="Home"
          onClick={() => setCursor(0)}
        />
        <span className="editor-time">
          {formatTime(time, true)} / {formatTime(duration, true)}
        </span>
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton
          icon={Undo2}
          label={t.undo}
          shortcut="Ctrl+Z"
          onClick={undo}
          disabled={!canUndo}
        />
        <IconButton
          icon={Redo2}
          label={t.redo}
          shortcut="Ctrl+Y"
          onClick={redo}
          disabled={!canRedo}
        />
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton
          icon={Scissors}
          label={t.split}
          shortcut="S"
          onClick={splitAtPlayhead}
          disabled={disabled}
        />
        <IconButton
          icon={CopyPlus}
          label={t.duplicate}
          shortcut="Ctrl+D"
          onClick={duplicateSelected}
          disabled={!selected}
        />
        <IconButton
          icon={Copy}
          label={t.copy}
          shortcut="Ctrl+C"
          onClick={copySelected}
          disabled={!selected}
        />
        <IconButton
          icon={ClipboardPaste}
          label={t.paste}
          shortcut="Ctrl+V"
          onClick={paste}
          disabled={!hasClipboard}
        />
        <IconButton
          icon={Trash}
          label={t.deleteClip}
          shortcut="Delete"
          onClick={deleteSelected}
          disabled={!selected}
        />
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <IconButton
          icon={ZoomOut}
          label={t.zoomOut}
          shortcut="−"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        />
        <IconButton icon={ZoomIn} label={t.zoomIn} shortcut="+" onClick={() => zoomBy(ZOOM_STEP)} />
        <IconButton icon={Scan} label={t.zoomFit} onClick={onFit} disabled={duration <= 0} />
      </div>
      <Button
        className="editor-save"
        variant="primary"
        icon={Save}
        onClick={onSave}
        disabled={duration <= 0}
      >
        {t.save}
      </Button>
    </div>
  );
}
