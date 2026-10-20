import { useCallback, useEffect, useRef, useState } from "react";
import { ru } from "../../shared/i18n/ru";
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

const TOOLS: { id: Tool; icon: string; code: string }[] = [
  { id: "pointer", icon: "↖", code: "KeyP" },
  { id: "brush", icon: "✎", code: "KeyB" },
  { id: "rect", icon: "▭", code: "KeyR" },
  { id: "fill", icon: "◩", code: "KeyG" },
  { id: "eraser", icon: "⌫", code: "KeyE" },
  { id: "select", icon: "⬚", code: "KeyV" },
  { id: "object", icon: "▣", code: "KeyO" },
];

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
      <div className="map-toolbar">
        <button type="button" onClick={() => void close()} title={ru.battlemap.back}>
          ←
        </button>
        <div className="map-title">
          {map.isTemplate && <span className="badge">{ru.battlemap.templates.badge}</span>}
          <strong>{map.name}</strong>
          <span className="muted">{ru.battlemap.sizeCells(model.width, model.height)}</span>
        </div>
        <div className="segmented">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tool === t.id ? "active" : undefined}
              title={ru.battlemap.tools[t.id]}
              aria-label={ru.battlemap.tools[t.id]}
              onClick={() => setTool(t.id)}
            >
              {t.icon}
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            onClick={undo}
            disabled={history.past.length === 0}
            title={ru.battlemap.undo}
            aria-label={ru.battlemap.undo}
          >
            ↶
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={history.future.length === 0}
            title={ru.battlemap.redo}
            aria-label={ru.battlemap.redo}
          >
            ↷
          </button>
        </div>
        <div className="toolbar-group">
          <button type="button" onClick={() => zoomBy(1 / 1.25)} title={ru.battlemap.zoomOut}>
            −
          </button>
          <button
            type="button"
            className="zoom-value"
            onClick={() => setView(fitView(model, viewport))}
            title={ru.battlemap.zoomFit}
          >
            {shown ? `${Math.round(shown.zoom * 100)}%` : ""}
          </button>
          <button type="button" onClick={() => zoomBy(1.25)} title={ru.battlemap.zoomIn}>
            +
          </button>
        </div>
        <button type="button" onClick={() => setResizing(true)}>
          {ru.battlemap.resize}
        </button>
        <button type="button" onClick={() => setExporting(true)}>
          {ru.battlemap.export.button}
        </button>
        {!map.isTemplate && (
          <button
            type="button"
            onClick={() =>
              void saveAsTemplate(map.id).then(
                () => setNotice(ru.battlemap.templates.saved),
                (error: unknown) => {
                  console.error(error);
                  setNotice(ru.battlemap.templates.saveFailed);
                },
              )
            }
          >
            {ru.battlemap.templates.saveAs}
          </button>
        )}
        <span className="spacer" />
        {notice && <span className="notice-text">{notice}</span>}
        <span className={saveState === "error" ? "error" : "muted"}>{SAVE_LABEL[saveState]}</span>
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

        <SidePanel model={model} types={types} objectDefs={objectDefs} />
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
