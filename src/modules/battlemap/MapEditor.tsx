import { useCallback, useEffect, useRef, useState } from "react";
import {
  Armchair,
  ArrowLeft,
  Check,
  CircleAlert,
  Download,
  Eraser,
  LayoutTemplate,
  LoaderCircle,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  Redo2,
  Scaling,
  Square,
  SquareDashed,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { Button, IconButton, Segmented } from "../../shared/ui";
import { FLOOR, type CellType } from "./domain/cellTypes";
import { paintCells } from "./domain/grid";
import { removeObjects, rotateObjects, type ObjectDef, type ObjectSizeOf } from "./domain/objects";
import { fitView, zoomAt, type View } from "./domain/view";
import { ExportDialog } from "./ExportDialog";
import { MapCanvas } from "./MapCanvas";
import { Palette } from "./Palette";
import { ResizeDialog } from "./ResizeDialog";
import { SidePanel } from "./SidePanel";
import { useEditorStore, useMapListStore, type SaveState, type Tool } from "./store";

const TOOLS: { id: Tool; icon: LucideIcon; code: string }[] = [
  { id: "pointer", icon: MousePointer2, code: "KeyP" },
  { id: "brush", icon: Paintbrush, code: "KeyB" },
  { id: "rect", icon: Square, code: "KeyR" },
  { id: "fill", icon: PaintBucket, code: "KeyG" },
  { id: "eraser", icon: Eraser, code: "KeyE" },
  { id: "select", icon: SquareDashed, code: "KeyV" },
  { id: "object", icon: Armchair, code: "KeyO" },
];

const SAVE_ICON: Record<SaveState, LucideIcon> = {
  saved: Check,
  pending: LoaderCircle,
  saving: LoaderCircle,
  error: CircleAlert,
};

const SAVE_LABEL: Record<SaveState, string> = {
  saved: ru.battlemap.saved,
  pending: ru.battlemap.saving,
  saving: ru.battlemap.saving,
  error: ru.battlemap.saveError,
};

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

interface MapEditorProps {
  types: CellType[];
  objectDefs: ObjectDef[];
}

export function MapEditor({ types, objectDefs }: MapEditorProps) {
  const map = useEditorStore((s) => s.map);
  const history = useEditorStore((s) => s.history);
  const tool = useEditorStore((s) => s.tool);
  const saveState = useEditorStore((s) => s.saveState);
  const close = useEditorStore((s) => s.close);
  const commit = useEditorStore((s) => s.commit);
  const setTool = useEditorStore((s) => s.setTool);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const [view, setView] = useState<View | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [panMode, setPanMode] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const saveAsTemplate = useMapListStore((s) => s.saveAsTemplate);

  const model = history?.present ?? null;

  const onViewportResize = useCallback((size: { width: number; height: number }) => {
    setViewport(size);
  }, []);

  // Keyboard handlers read the catalog through a ref, so they are bound only once.
  const sizeOfRef = useRef<ObjectSizeOf>(() => null);
  useEffect(() => {
    const byId = new Map(objectDefs.map((d) => [d.id, d]));
    sizeOfRef.current = (id) => byId.get(id) ?? null;
  }, [objectDefs]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector(".modal-backdrop")) return;
      const s = useEditorStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      // e.code is layout-independent, so shortcuts also work with the Russian layout.
      if (ctrl && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (ctrl && e.code === "KeyY") {
        e.preventDefault();
        s.redo();
      } else if (e.code === "Space") {
        e.preventDefault();
        setPanMode(true);
      } else if (e.key === "Escape") {
        s.setSelection(new Set());
        s.setSelectedObjects(new Set());
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const present = s.history?.present;
        if (!present) return;
        // Selected objects go first; cells are cleared only when no object is selected.
        if (s.selectedObjects.size > 0) s.commit(removeObjects(present, s.selectedObjects));
        else if (s.selection.size > 0) s.commit(paintCells(present, s.selection, FLOOR));
      } else if (e.code === "KeyR" && !ctrl && !e.altKey && s.tool === "object") {
        s.rotatePlacement();
      } else if (e.code === "KeyR" && !ctrl && !e.altKey && s.selectedObjects.size > 0) {
        const present = s.history?.present;
        if (present) s.commit(rotateObjects(present, sizeOfRef.current, s.selectedObjects));
      } else if (!ctrl && !e.altKey) {
        const t = TOOLS.find((x) => x.code === e.code);
        if (t) s.setTool(t.id);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setPanMode(false);
    };
    const onBlur = () => setPanMode(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  if (!map || !history || !model) return null;

  // Until the user zooms or pans, the whole map is fitted into the viewport.
  const shown = view ?? (viewport.width > 0 ? fitView(model, viewport) : null);
  const zoomBy = (factor: number) =>
    shown && setView(zoomAt(shown, shown.zoom * factor, viewport.width / 2, viewport.height / 2));

  return (
    <div className="map-editor">
      <header className="map-editor-head">
        <button type="button" className="map-editor-back" onClick={() => void close()}>
          <ArrowLeft aria-hidden />
          {ru.battlemap.title}
        </button>
        <div className="map-editor-title">
          <h1>{map.name}</h1>
          {map.isTemplate && <span className="badge accent">{ru.battlemap.templates.badge}</span>}
          <span className="badge">{ru.battlemap.sizeCells(model.width, model.height)}</span>
          <SaveIndicator state={saveState} />
          <span className="spacer" />
          {notice && <span className="notice-text">{notice}</span>}
          <Button variant="primary" icon={Download} onClick={() => setExporting(true)}>
            {ru.battlemap.export.button}
          </Button>
        </div>
      </header>

      <div className="toolbar map-toolbar">
        <Segmented
          label={ru.battlemap.toolsLabel}
          value={tool}
          onChange={setTool}
          options={TOOLS.map((t) => ({
            value: t.id,
            label: ru.battlemap.tools[t.id],
            icon: t.icon,
            iconOnly: true,
            shortcut: t.code.slice(3),
          }))}
        />
        <div className="toolbar-sep" />
        <div className="toolbar-group">
          <IconButton
            icon={Undo2}
            label={ru.battlemap.undo}
            shortcut="Ctrl+Z"
            onClick={undo}
            disabled={history.past.length === 0}
          />
          <IconButton
            icon={Redo2}
            label={ru.battlemap.redo}
            shortcut="Ctrl+Y"
            onClick={redo}
            disabled={history.future.length === 0}
          />
        </div>
        <div className="toolbar-group">
          <IconButton
            icon={ZoomOut}
            label={ru.battlemap.zoomOut}
            onClick={() => zoomBy(1 / 1.25)}
          />
          <Button
            variant="ghost"
            className="zoom-value"
            onClick={() => setView(fitView(model, viewport))}
            title={ru.battlemap.zoomFit}
          >
            {shown ? `${Math.round(shown.zoom * 100)}%` : ""}
          </Button>
          <IconButton icon={ZoomIn} label={ru.battlemap.zoomIn} onClick={() => zoomBy(1.25)} />
        </div>
        <div className="toolbar-sep" />
        <IconButton icon={Scaling} label={ru.battlemap.resize} onClick={() => setResizing(true)} />
        {!map.isTemplate && (
          <IconButton
            icon={LayoutTemplate}
            label={ru.battlemap.templates.saveAs}
            onClick={() =>
              void saveAsTemplate(map.id).then(
                () => setNotice(ru.battlemap.templates.saved),
                (error: unknown) => {
                  console.error(error);
                  setNotice(ru.battlemap.templates.saveFailed);
                },
              )
            }
          />
        )}
      </div>

      <div className="map-body">
        <Palette types={types} objectDefs={objectDefs} />

        <MapCanvas
          model={model}
          types={types}
          objectDefs={objectDefs}
          view={shown ?? { x: 0, y: 0, zoom: 1 }}
          onViewChange={setView}
          onViewportResize={onViewportResize}
          panMode={panMode}
        />

        <SidePanel
          mapId={map.isTemplate ? null : map.id}
          model={model}
          types={types}
          objectDefs={objectDefs}
        />
      </div>

      {exporting && (
        <ExportDialog
          name={map.name}
          description={map.description}
          model={model}
          types={types}
          objectDefs={objectDefs}
          onClose={() => setExporting(false)}
        />
      )}
      {resizing && (
        <ResizeDialog
          model={model}
          onApply={(next) => {
            commit(next);
            // Cell indices change with the width, so the old selection is meaningless.
            useEditorStore.getState().setSelection(new Set());
          }}
          onClose={() => setResizing(false)}
        />
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const Icon = SAVE_ICON[state];
  return (
    <span className={`save-state ${state}`} role="status">
      <Icon aria-hidden />
      {SAVE_LABEL[state]}
    </span>
  );
}
