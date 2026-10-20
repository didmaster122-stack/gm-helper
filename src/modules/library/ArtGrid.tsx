import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useRef, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { artName, toAbsolute } from "./domain/paths";
import type { Art } from "./domain/types";
import { useThumbnail } from "./thumbnails";

const TILE = 150;
const GAP = 10;
const ROW = TILE + 34;

interface ArtGridProps {
  root: string;
  arts: readonly Art[];
  selectedId: string | null;
  onSelect: (art: Art) => void;
  /** Double click / Enter. */
  onActivate?: (art: Art) => void;
  /** Tokens per art id, for the badge on tiles. */
  tokensByArt?: ReadonlyMap<string, readonly unknown[]>;
}

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function ArtGrid({
  root,
  arts,
  selectedId,
  onSelect,
  onActivate,
  tokensByArt,
}: ArtGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = useWidth(scrollRef);
  const columns = Math.max(1, Math.floor((width - GAP) / (TILE + GAP)));
  const rows = Math.ceil(arts.length / columns);

  // The project does not use React Compiler, so its memoization warning does not apply.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 3,
  });

  // Keep the selected tile visible when it changes from outside (e.g. after a rename).
  useEffect(() => {
    const index = arts.findIndex((a) => a.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(Math.floor(index / columns), { align: "auto" });
  }, [selectedId, columns, arts, virtualizer]);

  return (
    <div className="art-grid" ref={scrollRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className="art-grid-row"
            style={{
              transform: `translateY(${row.start}px)`,
              gridTemplateColumns: `repeat(${columns}, ${TILE}px)`,
              gap: GAP,
              padding: `0 ${GAP}px`,
            }}
          >
            {arts.slice(row.index * columns, row.index * columns + columns).map((art) => (
              <ArtTile
                key={art.id}
                art={art}
                path={toAbsolute(root, art.relPath)}
                selected={art.id === selectedId}
                tokens={tokensByArt?.get(art.id)?.length ?? 0}
                onSelect={onSelect}
                onActivate={onActivate}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface ArtTileProps {
  art: Art;
  path: string;
  selected: boolean;
  tokens: number;
  onSelect: (art: Art) => void;
  onActivate?: (art: Art) => void;
}

const ArtTile = memo(function ArtTile({
  art,
  path,
  selected,
  tokens,
  onSelect,
  onActivate,
}: ArtTileProps) {
  const thumb = useThumbnail(path, art.hash);
  const name = artName(art);

  return (
    <button
      type="button"
      className={`art-tile ${selected ? "selected" : ""} ${art.missing ? "missing" : ""}`}
      onClick={() => onSelect(art)}
      onDoubleClick={() => onActivate?.(art)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onActivate?.(art);
      }}
      title={art.relPath}
    >
      <div className="art-thumb">
        {thumb.kind === "ready" && <img src={thumb.url} alt="" draggable={false} />}
        {thumb.kind === "error" && <span className="muted">{ru.library.art.noPreview}</span>}
        {tokens > 0 && (
          <span className="token-badge" title={ru.library.tokenBadge(tokens)}>
            {tokens}
          </span>
        )}
      </div>
      <div className="art-name">{name}</div>
    </button>
  );
});
