import { useEffect, useMemo, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { EmptyState, Modal } from "../../shared/ui";
import { ArtGrid } from "./ArtGrid";
import { searchArts } from "./domain/search";
import type { Art, LibrarySelection } from "./domain/types";
import { useLibraryStore } from "./store";

interface ArtPickerProps {
  libraryRoot: string;
  /** Campaign system: searched first, with a switch to the whole library. */
  preferredSystem: string | null;
  initialQuery?: string;
  onPick: (art: Art) => void;
  onClose: () => void;
}

/** Modal art search shared by other modules (e.g. picking a character portrait). */
export function ArtPicker({
  libraryRoot,
  preferredSystem,
  initialQuery = "",
  onPick,
  onClose,
}: ArtPickerProps) {
  const open = useLibraryStore((s) => s.open);
  const entries = useLibraryStore((s) => s.entries);
  const tree = useLibraryStore((s) => s.tree);
  const syncing = useLibraryStore((s) => s.syncing);
  const [query, setQuery] = useState(initialQuery);
  const [wholeLibrary, setWholeLibrary] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void open(libraryRoot);
  }, [open, libraryRoot]);

  const hasSystem = !!preferredSystem && tree.systems.some((s) => s.name === preferredSystem);
  const selection = useMemo<LibrarySelection>(
    () =>
      hasSystem && !wholeLibrary && preferredSystem
        ? { kind: "system", system: preferredSystem }
        : { kind: "all" },
    [hasSystem, wholeLibrary, preferredSystem],
  );
  const results = useMemo(() => searchArts(entries, query, selection), [entries, query, selection]);
  const selected = results.find((a) => a.id === selectedId) ?? null;

  return (
    <Modal
      title={ru.library.picker.title}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose}>
            {ru.common.cancel}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!selected}
            onClick={() => selected && onPick(selected)}
          >
            {ru.library.picker.choose}
          </button>
        </>
      }
    >
      <div className="picker-toolbar">
        <input
          type="search"
          placeholder={ru.library.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {hasSystem && preferredSystem && (
          <div className="segmented">
            <button
              type="button"
              className={!wholeLibrary ? "active" : ""}
              onClick={() => setWholeLibrary(false)}
            >
              {ru.library.picker.onlySystem(preferredSystem)}
            </button>
            <button
              type="button"
              className={wholeLibrary ? "active" : ""}
              onClick={() => setWholeLibrary(true)}
            >
              {ru.library.picker.wholeLibrary}
            </button>
          </div>
        )}
      </div>
      <div className="picker-grid">
        {results.length > 0 ? (
          <ArtGrid
            root={libraryRoot}
            arts={results}
            selectedId={selectedId}
            onSelect={(art) => setSelectedId(art.id)}
            onActivate={onPick}
          />
        ) : (
          !syncing && (
            <EmptyState
              title={ru.library.emptyTitle}
              text={query.trim() ? ru.library.noResults(query.trim()) : ru.library.emptySelection}
            />
          )
        )}
      </div>
    </Modal>
  );
}
