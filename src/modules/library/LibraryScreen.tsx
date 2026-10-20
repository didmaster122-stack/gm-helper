import { useEffect, useMemo, useRef } from "react";
import { ru } from "../../shared/i18n/ru";
import { EmptyState } from "../../shared/ui";
import { ArtGrid } from "./ArtGrid";
import { ArtPanel } from "./ArtPanel";
import { searchArts } from "./domain/search";
import { ImportDialog } from "./ImportDialog";
import { LibraryTree } from "./LibraryTree";
import { useLibraryStore, useSelectedArt } from "./store";
import { useDropImport } from "./useDropImport";

interface LibraryScreenProps {
  libraryRoot: string;
  /** System of the active campaign: selected by default when it exists in the library. */
  preferredSystem: string | null;
}

export function LibraryScreen({ libraryRoot, preferredSystem }: LibraryScreenProps) {
  const open = useLibraryStore((s) => s.open);
  const root = useLibraryStore((s) => s.root);
  const entries = useLibraryStore((s) => s.entries);
  const tree = useLibraryStore((s) => s.tree);
  const selection = useLibraryStore((s) => s.selection);
  const setSelection = useLibraryStore((s) => s.setSelection);
  const query = useLibraryStore((s) => s.query);
  const setQuery = useLibraryStore((s) => s.setQuery);
  const syncing = useLibraryStore((s) => s.syncing);
  const progress = useLibraryStore((s) => s.progress);
  const syncErrors = useLibraryStore((s) => s.syncErrors);
  const error = useLibraryStore((s) => s.error);
  const sync = useLibraryStore((s) => s.sync);
  const selectArt = useLibraryStore((s) => s.selectArt);
  const selected = useSelectedArt();
  const drop = useDropImport();

  useEffect(() => {
    void open(libraryRoot);
  }, [open, libraryRoot]);

  // Default to the campaign's system once per root, after the first scan found it.
  const preferredApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!preferredSystem || preferredApplied.current === libraryRoot) return;
    if (tree.systems.some((s) => s.name === preferredSystem)) {
      preferredApplied.current = libraryRoot;
      if (useLibraryStore.getState().selection.kind === "all") {
        setSelection({ kind: "system", system: preferredSystem });
      }
    }
  }, [tree, preferredSystem, libraryRoot, setSelection]);

  const results = useMemo(() => searchArts(entries, query, selection), [entries, query, selection]);

  if (root !== libraryRoot) return null;

  let status: string | null = null;
  if (progress) status = ru.library.syncProgress(progress.done, progress.total);
  else if (syncing) status = ru.library.syncing;

  const dropTarget = selection.kind === "group" ? selection.group : null;

  return (
    <div className="library">
      <LibraryTree />

      <section className="library-main">
        <div className="library-toolbar">
          <input
            type="search"
            className="library-search"
            placeholder={ru.library.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <span className="muted">{ru.library.count(results.length)}</span>
          <span className="spacer" />
          {status && <span className="muted">{status}</span>}
          {syncErrors.length > 0 && (
            <span className="warning" title={syncErrors.slice(0, 20).join("\n")}>
              {ru.library.syncErrors(syncErrors.length)}
            </span>
          )}
          <button type="button" onClick={() => void sync()} disabled={syncing}>
            {ru.library.refresh}
          </button>
        </div>

        {drop.notice && (
          <div className="notice" onClick={drop.clearNotice}>
            {drop.notice}
          </div>
        )}
        {error && <div className="notice error">{error}</div>}
        {selection.kind === "unsorted" && <p className="library-hint">{ru.library.unsortedHint}</p>}
        {selection.kind === "missing" && <p className="library-hint">{ru.library.missingHint}</p>}

        {results.length > 0 ? (
          <ArtGrid
            root={libraryRoot}
            arts={results}
            selectedId={selected?.id ?? null}
            onSelect={(art) => selectArt(art.id)}
          />
        ) : (
          !syncing && (
            <EmptyState
              title={ru.library.emptyTitle}
              text={
                query.trim()
                  ? ru.library.noResults(query.trim())
                  : selection.kind === "group"
                    ? ru.library.emptyGroup
                    : ru.library.emptySelection
              }
            />
          )
        )}

        {drop.dragging && (
          <div className="drop-overlay">
            {dropTarget ? ru.library.dropHere(dropTarget) : ru.library.dropNeedGroup}
          </div>
        )}
      </section>

      {selected && <ArtPanel art={selected} />}

      {drop.pending && (
        <ImportDialog
          items={drop.pending.items}
          onRun={drop.resolvePending}
          onClose={drop.cancelPending}
        />
      )}
    </div>
  );
}
