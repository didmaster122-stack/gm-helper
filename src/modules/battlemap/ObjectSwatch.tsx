import { useEffect, useRef } from "react";
import type { ObjectDef } from "./domain/objects";
import { drawObjectSwatch } from "./render";
import { useDecodedSymbol } from "./useDecodedSymbol";

/** A catalog object drawn as on the map, scaled into a square. */
export function ObjectSwatch({ def, size = 22 }: { def: ObjectDef; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const decoded = useDecodedSymbol(def.symbol);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawObjectSwatch(ctx, def, 0, 0, size);
  }, [def, size, decoded]);

  return (
    <canvas ref={ref} className="type-swatch object-swatch" style={{ width: size, height: size }} />
  );
}
