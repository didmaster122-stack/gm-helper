// Timeline scale: zoom limits, ruler ticks and time labels.

/** Pixels per second. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 400;
export const ZOOM_DEFAULT = 8;

const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200];

export const clampZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

/** Seconds between labelled ruler ticks, so that labels are at least `minPx` apart. */
export function rulerStep(zoom: number, minPx = 72): number {
  return STEPS.find((s) => s * zoom >= minPx) ?? STEPS[STEPS.length - 1] ?? 1200;
}

/** "1:05", or "1:05.3" when tenths matter. */
export function formatTime(seconds: number, tenths = false): string {
  const total = Math.max(0, seconds);
  const whole = tenths ? Math.floor(total * 10) / 10 : Math.floor(total);
  const m = Math.floor(whole / 60);
  const s = whole - m * 60;
  const sec = tenths ? s.toFixed(1).padStart(4, "0") : String(Math.floor(s)).padStart(2, "0");
  return `${m}:${sec}`;
}

/** Zoom that fits `duration` seconds into `width` pixels. */
export function fitZoom(duration: number, width: number): number {
  if (duration <= 0 || width <= 0) return ZOOM_DEFAULT;
  return clampZoom(width / duration);
}
