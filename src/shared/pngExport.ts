import { getViewportForBounds, type Rect } from "@xyflow/react";
import { toPng } from "html-to-image";

const PADDING = 40;
/** Larger images would exceed the canvas limits of the webview. */
const MAX_SIDE = 8000;

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Renders the part of a React Flow viewport inside `bounds` (flow units) to PNG,
 * at twice the flow scale while that fits.
 */
export async function renderFlowPng(
  viewportElement: HTMLElement,
  bounds: Rect,
  background: string,
): Promise<Uint8Array> {
  const width = Math.ceil(bounds.width + 2 * PADDING);
  const height = Math.ceil(bounds.height + 2 * PADDING);
  const viewport = getViewportForBounds(bounds, width, height, 0.1, 1, `${PADDING}px`);
  const pixelRatio = Math.max(0.5, Math.min(2, MAX_SIDE / Math.max(width, height)));
  const url = await toPng(viewportElement, {
    backgroundColor: background,
    width,
    height,
    pixelRatio,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });
  return dataUrlToBytes(url);
}

/** Renders a whole element (`width` × `height` CSS pixels) to PNG, at twice the scale while that fits. */
export async function renderElementPng(
  element: HTMLElement,
  width: number,
  height: number,
  background: string,
): Promise<Uint8Array> {
  const pixelRatio = Math.max(0.5, Math.min(2, MAX_SIDE / Math.max(width, height)));
  const url = await toPng(element, { backgroundColor: background, width, height, pixelRatio });
  return dataUrlToBytes(url);
}
