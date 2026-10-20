// Canvas helpers shared by the source waveforms and the timeline.
import { useEffect, useState, type RefObject } from "react";
import { peakRange, type Peaks } from "./domain/waveform";

/** Width of an element in CSS pixels, kept up to date. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Sizes the backing store for the screen's pixel ratio; drawing then uses CSS pixels. */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Draws a waveform into the box x…x+width, y…y+height. `from` is the source time at x,
 * `secondsPerPx` the scale. Columns outside `clipLeft…clipRight` are skipped.
 */
export function drawPeaks(
  ctx: CanvasRenderingContext2D,
  peaks: Peaks,
  box: { x: number; y: number; width: number; height: number },
  from: number,
  secondsPerPx: number,
  clipLeft = -Infinity,
  clipRight = Infinity,
): void {
  const mid = box.y + box.height / 2;
  const half = box.height / 2;
  const first = Math.max(Math.floor(box.x), Math.floor(clipLeft));
  const last = Math.min(Math.ceil(box.x + box.width), Math.ceil(clipRight));
  ctx.beginPath();
  for (let px = first; px < last; px++) {
    const t0 = from + (px - box.x) * secondsPerPx;
    const [lo, hi] = peakRange(peaks, t0, t0 + secondsPerPx);
    const top = mid - hi * half;
    const bottom = mid - lo * half;
    ctx.rect(px, top, 1, Math.max(1, bottom - top));
  }
  ctx.fill();
}
