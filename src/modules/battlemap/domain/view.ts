/** Cell side in CSS pixels at 100% zoom. */
export const CELL_PX = 24;
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;

/** Screen position of the map's top-left corner and the zoom factor. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

export function cellSize(view: View): number {
  return CELL_PX * view.zoom;
}

/** Cell under a screen point (may be outside the map). */
export function screenToCell(view: View, sx: number, sy: number): { x: number; y: number } {
  const s = cellSize(view);
  return { x: Math.floor((sx - view.x) / s), y: Math.floor((sy - view.y) / s) };
}

/** Zooms keeping the map point under (sx, sy) in place. */
export function zoomAt(view: View, zoom: number, sx: number, sy: number): View {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const k = z / view.zoom;
  return { zoom: z, x: sx - (sx - view.x) * k, y: sy - (sy - view.y) * k };
}

/** Centres the whole map in the viewport, never above 100%. */
export function fitView(
  map: { width: number; height: number },
  viewport: { width: number; height: number },
  padding = 24,
): View {
  const zw = (viewport.width - padding * 2) / (map.width * CELL_PX);
  const zh = (viewport.height - padding * 2) / (map.height * CELL_PX);
  const zoom = Math.min(1, Math.max(MIN_ZOOM, Math.min(zw, zh)));
  const s = CELL_PX * zoom;
  return {
    zoom,
    x: Math.round((viewport.width - map.width * s) / 2),
    y: Math.round((viewport.height - map.height * s) / 2),
  };
}

/** Range of cells intersecting the viewport, clipped to the map (inclusive bounds). */
export function visibleCells(
  view: View,
  map: { width: number; height: number },
  viewport: { width: number; height: number },
): { x0: number; y0: number; x1: number; y1: number } {
  const s = cellSize(view);
  return {
    x0: Math.max(0, Math.floor(-view.x / s)),
    y0: Math.max(0, Math.floor(-view.y / s)),
    x1: Math.min(map.width - 1, Math.floor((viewport.width - view.x) / s)),
    y1: Math.min(map.height - 1, Math.floor((viewport.height - view.y) / s)),
  };
}
