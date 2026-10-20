import { useEffect, useRef } from "react";
import type { CellType } from "./domain/cellTypes";
import { drawCell } from "./render";
import { useDecodedSymbol } from "./useDecodedSymbol";

/** A cell type drawn exactly as on the map. */
export function TypeSwatch({ type, size = 22 }: { type: CellType; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const decoded = useDecodedSymbol(type.symbol);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCell(ctx, type, 0, 0, size);
  }, [type, size, decoded]);

  return <canvas ref={ref} className="type-swatch" style={{ width: size, height: size }} />;
}
