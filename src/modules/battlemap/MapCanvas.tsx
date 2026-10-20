import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { FLOOR, makeTypeLookup, type CellType } from "./domain/cellTypes";
import {
  cellIndex,
  floodCells,
  inBounds,
  labelCell,
  lineCells,
  outlineSegments,
  paintCells,
  rectCells,
  regionLookup,
  type BattlemapModel,
  type Point,
} from "./domain/grid";
import {
  addObject,
  clampPosition,
  footprint,
  moveObjects,
  objectAt,
  type MapObject,
  type ObjectDef,
  type ObjectSizeOf,
} from "./domain/objects";
import { applySelection, selectModeFor, type SelectMode } from "./domain/selection";
import { screenToCell, zoomAt, type View } from "./domain/view";
import { buildBaseLayer, drawScene, type RegionOverlay, type Scene } from "./render";
import { useEditorStore } from "./store";

const WHEEL_STEP = 1.2;

type Drag =
  | { kind: "pan"; sx: number; sy: number; view: View }
  /** `committed`: the stroke already has its own undo step. */
  | { kind: "paint"; last: Point; typeId: string; committed: boolean }
  | { kind: "rect"; start: Point; end: Point }
  | { kind: "select"; start: Point; end: Point; mode: SelectMode }
  /** Dragging selected objects; `base` is the model before the drag. */
  | {
      kind: "objects";
      start: Point;
      last: Point;
      base: BattlemapModel;
      ids: ReadonlySet<string>;
      committed: boolean;
    };

interface MapCanvasProps {
  model: BattlemapModel;
  types: CellType[];
  objectDefs: ObjectDef[];
  view: View;
  onViewChange: (view: View) => void;
  onViewportResize: (size: { width: number; height: number }) => void;
  /** Space is held: left button pans. */
  panMode: boolean;
}

export function MapCanvas({
  model,
  types,
  objectDefs,
  view,
  onViewChange,
  onViewportResize,
  panMode,
}: MapCanvasProps) {
  const tool = useEditorStore((s) => s.tool);
  const typeId = useEditorStore((s) => s.typeId);
  const selection = useEditorStore((s) => s.selection);
  const regionId = useEditorStore((s) => s.regionId);
  const selectedObjects = useEditorStore((s) => s.selectedObjects);
  const objectDefId = useEditorStore((s) => s.objectDefId);
  const placeRotation = useEditorStore((s) => s.placeRotation);
  const commit = useEditorStore((s) => s.commit);
  const replace = useEditorStore((s) => s.replace);
  const setSelection = useEditorStore((s) => s.setSelection);
  const setSelectedObjects = useEditorStore((s) => s.setSelectedObjects);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<Point | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // Handlers read the ref: several pointer events can arrive before the next render.
  const dragRef = useRef<Drag | null>(null);
  function setDrag(next: Drag | null) {
    dragRef.current = next;
    setDragState(next);
  }
  // The wheel listener reads the latest view without re-binding.
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  }, [view]);

  /** The store's model: newer than the prop between an edit and the next render. */
  function currentModel(): BattlemapModel {
    return useEditorStore.getState().history?.present ?? model;
  }

  const typeOf = useMemo(() => makeTypeLookup(types), [types]);
  const defById = useMemo(() => new Map(objectDefs.map((d) => [d.id, d])), [objectDefs]);
  const defOf = useCallback((id: string) => defById.get(id), [defById]);
  const sizeOf = useCallback<ObjectSizeOf>((id) => defById.get(id) ?? null, [defById]);
  const lookup = useMemo(() => regionLookup(model), [model]);
  const base = useMemo(() => buildBaseLayer(model, lookup, typeOf), [model, lookup, typeOf]);
  const overlays = useMemo<RegionOverlay[]>(
    () =>
      model.regions.map((r) => ({
        id: r.id,
        name: r.name,
        segments: outlineSegments(r.cells, model.width),
        labelCell: r.labelVisible ? labelCell(r.cells, model.width) : null,
      })),
    [model.regions, model.width],
  );
  const selectionOutline = useMemo(
    () => outlineSegments([...selection], model.width),
    [selection, model.width],
  );
  const activeRegion = useMemo(() => {
    const r = model.regions.find((x) => x.id === regionId);
    return r ? { id: r.id, cells: r.cells } : null;
  }, [model.regions, regionId]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = {
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      };
      setSize(next);
      onViewportResize(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onViewportResize]);

  const preview = useMemo(() => {
    if (drag?.kind !== "rect") return null;
    const cells = rectCells(model, drag.start, drag.end);
    return { cells, color: typeOf(typeId).color };
  }, [drag, model, typeOf, typeId]);

  // The object the "Object" tool would place under the cursor.
  const ghost = useMemo<MapObject[] | null>(() => {
    if (tool !== "object" || drag || panMode || !hover || !objectDefId) return null;
    const def = defById.get(objectDefId);
    if (!def || !inBounds(model, hover.x, hover.y)) return null;
    const pos = clampPosition(model, hover.x, hover.y, footprint(def, placeRotation));
    return [{ id: "", defId: def.id, ...pos, rotation: placeRotation }];
  }, [tool, drag, panMode, hover, objectDefId, defById, model, placeRotation]);

  const frame = useMemo(() => {
    if (drag?.kind !== "select") return null;
    return {
      x0: Math.min(drag.start.x, drag.end.x),
      y0: Math.min(drag.start.y, drag.end.y),
      x1: Math.max(drag.start.x, drag.end.x),
      y1: Math.max(drag.start.y, drag.end.y),
    };
  }, [drag]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    const frameId = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(size.width * dpr);
      const h = Math.round(size.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const scene: Scene = {
        model,
        lookup,
        base,
        typeOf,
        view,
        width: size.width,
        height: size.height,
        regions: overlays,
        activeRegion,
        selection,
        selectionOutline,
        preview,
        frame,
        hover: hover && !ghost && inBounds(model, hover.x, hover.y) ? hover : null,
        objectDefOf: defOf,
        selectedObjects,
        ghost,
      };
      drawScene(ctx, scene);
    });
    return () => cancelAnimationFrame(frameId);
  }, [
    model,
    lookup,
    base,
    typeOf,
    view,
    size,
    overlays,
    activeRegion,
    selection,
    selectionOutline,
    preview,
    frame,
    hover,
    defOf,
    selectedObjects,
    ghost,
  ]);

  // React registers wheel listeners as passive, so preventDefault needs a native one.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const v = viewRef.current;
      const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      const next = zoomAt(v, v.zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
      // Fast wheel spins can fire again before the next render.
      viewRef.current = next;
      onViewChange(next);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onViewChange]);

  function local(e: PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  function cellOf(e: PointerEvent<HTMLCanvasElement>): Point {
    const { sx, sy } = local(e);
    return screenToCell(viewRef.current, sx, sy);
  }

  function clampPoint(p: Point): Point {
    const m = currentModel();
    return {
      x: Math.min(m.width - 1, Math.max(0, p.x)),
      y: Math.min(m.height - 1, Math.max(0, p.y)),
    };
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current) return;
    const { tool, typeId } = useEditorStore.getState();
    const isPan = e.button === 1 || (e.button === 0 && panMode);
    if (!isPan && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (isPan) {
      const { sx, sy } = local(e);
      setDrag({ kind: "pan", sx, sy, view: viewRef.current });
      return;
    }
    const m = currentModel();
    const p = cellOf(e);
    const inside = inBounds(m, p.x, p.y);
    switch (tool) {
      case "brush":
      case "eraser": {
        const paintType = tool === "eraser" ? FLOOR : typeId;
        const next = inside ? paintCells(m, [cellIndex(m, p.x, p.y)], paintType) : m;
        // A stroke that changed nothing yet must not extend the previous undo step.
        if (next !== m) commit(next);
        setDrag({ kind: "paint", last: p, typeId: paintType, committed: next !== m });
        return;
      }
      case "rect":
        if (inside) setDrag({ kind: "rect", start: p, end: p });
        return;
      case "fill":
        if (inside) commit(paintCells(m, floodCells(m, cellIndex(m, p.x, p.y)), typeId));
        return;
      case "object": {
        const { objectDefId, placeRotation } = useEditorStore.getState();
        if (!inside || !objectDefId) return;
        const placed = {
          id: crypto.randomUUID(),
          defId: objectDefId,
          x: p.x,
          y: p.y,
          rotation: placeRotation,
        };
        commit(addObject(m, sizeOf, placed));
        return;
      }
      case "select": {
        const mode = selectModeFor(e);
        const hit = inside ? objectAt(m, sizeOf, p.x, p.y) : null;
        if (hit) {
          selectObject(hit.id, mode, p, m);
          return;
        }
        if (mode === "replace") setSelectedObjects(new Set());
        const start = clampPoint(p);
        setDrag({ kind: "select", start, end: start, mode });
        return;
      }
      case "pointer": {
        // Objects only: a click selects (Shift/Ctrl as usual), empty space drags the view.
        const mode = selectModeFor(e);
        const hit = inside ? objectAt(m, sizeOf, p.x, p.y) : null;
        if (hit) {
          selectObject(hit.id, mode, p, m);
          return;
        }
        if (mode === "replace") setSelectedObjects(new Set());
        const { sx, sy } = local(e);
        setDrag({ kind: "pan", sx, sy, view: viewRef.current });
        return;
      }
    }
  }

  /** Click on a placed object with the selection or pointer tool; a plain click also starts dragging. */
  function selectObject(id: string, mode: SelectMode, p: Point, m: BattlemapModel) {
    const current = useEditorStore.getState().selectedObjects;
    if (mode === "toggle") {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedObjects(next);
      return;
    }
    let ids = current;
    if (mode === "add") ids = new Set([...current, id]);
    else if (!current.has(id)) {
      // A plain click on another object selects only it (and drops the cell selection).
      ids = new Set([id]);
      setSelection(new Set());
    }
    setSelectedObjects(ids);
    setDrag({ kind: "objects", start: p, last: p, base: m, ids, committed: false });
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const p = cellOf(e);
    if (p.x !== hover?.x || p.y !== hover.y) setHover(p);
    const drag = dragRef.current;
    if (!drag) return;
    const m = currentModel();
    switch (drag.kind) {
      case "pan": {
        const { sx, sy } = local(e);
        onViewChange({
          ...drag.view,
          x: drag.view.x + sx - drag.sx,
          y: drag.view.y + sy - drag.sy,
        });
        return;
      }
      case "paint": {
        if (p.x === drag.last.x && p.y === drag.last.y) return;
        const next = paintCells(m, lineCells(m, drag.last, p), drag.typeId);
        if (drag.committed) replace(next);
        else commit(next);
        setDrag({ ...drag, last: p, committed: drag.committed || next !== m });
        return;
      }
      case "rect":
      case "select": {
        const end = clampPoint(p);
        if (end.x !== drag.end.x || end.y !== drag.end.y) setDrag({ ...drag, end });
        return;
      }
      case "objects": {
        if (p.x === drag.last.x && p.y === drag.last.y) return;
        const dx = p.x - drag.start.x;
        const dy = p.y - drag.start.y;
        const next = moveObjects(drag.base, sizeOf, drag.ids, dx, dy);
        // The whole drag is one undo step, created by the first real move.
        if (drag.committed) replace(next);
        else if (next !== drag.base) commit(next);
        setDrag({ ...drag, last: p, committed: drag.committed || next !== drag.base });
        return;
      }
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    const { typeId } = useEditorStore.getState();
    const m = currentModel();
    if (drag.kind === "rect") {
      commit(paintCells(m, rectCells(m, drag.start, drag.end), typeId));
    } else if (drag.kind === "select") {
      const cells = rectCells(m, drag.start, drag.end);
      setSelection(applySelection(useEditorStore.getState().selection, cells, drag.mode));
    }
    setDrag(null);
  }

  const cursor =
    drag?.kind === "pan"
      ? "grabbing"
      : panMode
        ? "grab"
        : drag?.kind === "objects"
          ? "move"
          : tool === "select" || tool === "pointer"
            ? "default"
            : "crosshair";

  return (
    <div ref={wrapRef} className="map-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="map-canvas"
        style={{ width: size.width, height: size.height, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
