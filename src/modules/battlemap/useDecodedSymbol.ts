import { useEffect, useState } from "react";
import type { CellSymbol } from "./domain/cellTypes";
import { getImage, loadImages } from "./imageCache";

/** Bumps a counter once a picture symbol is decoded, so the swatch redraws with it. */
export function useDecodedSymbol(symbol: CellSymbol | null): number {
  const [version, setVersion] = useState(0);
  const url = symbol?.kind === "image" ? symbol.value : "";
  useEffect(() => {
    if (url === "" || getImage(url)) return;
    let alive = true;
    void loadImages([url]).then(() => alive && setVersion((v) => v + 1));
    return () => {
      alive = false;
    };
  }, [url]);
  return version;
}
