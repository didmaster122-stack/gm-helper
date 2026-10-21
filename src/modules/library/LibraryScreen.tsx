import { useEffect, useMemo, useRef } from "react";
import { CircleAlert, Download, ImageOff, Info, RefreshCw, SearchX, X } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { useRememberOpened } from "../../shared/recent";
import { EmptyState, IconButton, SearchInput } from "../../shared/ui";
import { ArtGrid } from "./ArtGrid";
import { ArtPanel, type CharacterTarget } from "./ArtPanel";
import { searchArts, type TokenFilter } from "./domain/search";
import { ImportDialog } from "../../shared/catalog/ImportDialog";
import { MissingBar } from "../../shared/catalog/MissingBar";
import { LibraryTree } from "./LibraryTree";
import { forgetMissingArts } from "./service";
import { useLibraryStore, useSelectedArt } from "./store";
import { useDropImport } from "./useDropImport";

const TOKEN_FILTERS: readonly TokenFilter[] = ["any", "with", "without"];

interface LibraryScreenProps {
  libraryRoot: string;
  /** System of the active campaign: selected by default when it exists in the library. */
  preferredSystem: string | null;
  /** Where "Create character" puts a character made from an art; hidden when null. */
  characterTarget?: CharacterTarget | null;
  /** Active campaign: an art looked at goes to its "recent" list. */
  campaignId?: string | null;
}

export function LibraryScreen({
  libraryRoot,
  preferredSystem,
  characterTarget = null,
  campaignId = null,
}: LibraryScreenProps) {
  const open = useLibraryStore((s) => s.open);
  const root = useLibraryStore((s) => s.root);
  const entries = useLibraryStore((s) => s.entries);
  const tree = useLibraryStore((s) => s.tree);
  const selection = useLibraryStore((s) => s.selection);
  const setSelection = useLibraryStore((s) => s.setSelection);
  const query = useLibraryStore((s) => s.query);
  const setQuery = useLibraryStore((s) => s.setQuery);
  const tokensByArt = useLibraryStore((s) => s.tokensByArt);
  const tokenFilter = useLibraryStore((s) => s.tokenFilter);
  const setTokenFilter = useLibraryStore((s) => s.setTokenFilter);
  const syncing = useLibraryStore((s) => s.syncing);
  const progress = useLibraryStore((s) => s.progress);
  const syncErrors = useLibraryStore((s) => s.syncErrors);
  const error = useLibraryStore((s) => s.error);
  const sync = useLibraryStore((s) => s.sync);
  const selectArt = useLibraryStore((s) => s.selectArt);
  const arts = useLibraryStore((s) => s.arts);
  const selected = useSelectedArt();
  const drop = useDropImport();
  useRememberOpened(campaignId, "art", selected?.id ?? null);

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

  const results = useMemo(
    () =>
      searchArts(entries, query, selection, {
        filter: tokenFilter,
        artsWithTokens: new Set(tokensByArt.keys()),
      }),
    [entries, query, selection, tokenFilter, tokensByArt],
  );

  if (root !== libraryRoot) return null;

  let status: string | null = null;
  if (progress) status = ru.library.syncProgress(progress.done, progress.total);
  else if (syncing) status = ru.library.syncing;

  const dropTarget = selection.kind === "group" ? selection.group : null;

  return (
    <div className="library">
      <LibraryTree />

      <section className="library-main">
        <div className="toolbar library-toolbar">
          <SearchInput
            wrapperClassName="library-search"
            screenSearch
            placeholder={ru.library.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <select
            value={tokenFilter}
            onChange={(e) =>
              setTokenFilter(TOKEN_FILTERS.find((f) => f === e.target.value) ?? "any")
            }
            aria-label={ru.library.filter.label}
          >
            {TOKEN_FILTERS.map((f) => (
              <option key={f} value={f}>
                {ru.library.filter[f]}
              </option>
            ))}
          </select>
          <span className="toolbar-count">{ru.library.count(results.length)}</span>
          <span className="spacer" />
          {status && <span className="toolbar-status">{status}</span>}
          {syncErrors.length > 0 && (
            <span className="badge warning" title={syncErrors.slice(0, 20).join("\n")}>
              {ru.library.syncErrors(syncErrors.length)}
            </span>
          )}
          <IconButton
            icon={RefreshCw}
            label={ru.library.refresh}
            className={syncing ? "spinning" : undefined}
            onClick={() => void sync()}
            disabled={syncing}
          />
        </div>

        {drop.notice && (
          <div className="notice">
            <Info aria-hidden />
            <span>{drop.notice}</span>
            <IconButton icon={X} size="sm" label={ru.common.close} onClick={drop.clearNotice} />
          </div>
        )}
        {error && (
          <div className="notice error">
            <CircleAlert aria-hidden />
            <span>{error}</span>
          </div>
        )}
        {selection.kind === "unsorted" && <p className="library-hint">{ru.library.unsortedHint}</p>}
        {selection.kind === "missing" && (
          <MissingBar
            hint={ru.library.missingHint}
            buttonLabel={ru.library.forgetMissing}
            confirmTitle={ru.library.forgetMissingTitle}
            confirmText={ru.library.forgetMissingText(
              tree.missing,
              arts.reduce((n, a) => n + (a.missing ? (tokensByArt.get(a.id)?.length ?? 0) : 0), 0),
            )}
            empty={tree.missing === 0}
            onConfirm={async () => {
              await forgetMissingArts(libraryRoot, arts, tokensByArt);
              selectArt(null);
              await sync();
            }}
          />
        )}

        {results.length > 0 ? (
          <ArtGrid
            root={libraryRoot}
            arts={results}
            selectedId={selected?.id ?? null}
            onSelect={(art) => selectArt(art.id)}
            tokensByArt={tokensByArt}
          />
        ) : (
          !syncing && (
            <EmptyState
              icon={query.trim() ? SearchX : ImageOff}
              title={ru.library.emptyTitle}
              text={
                query.trim()
                  ? ru.library.noResults(query.trim())
                  : selection.kind === "group" && tokenFilter === "any"
                    ? ru.library.emptyGroup
                    : ru.library.emptySelection
              }
            />
          )
        )}

        {drop.dragging && (
          <div className={dropTarget ? "drop-overlay" : "drop-overlay blocked"}>
            <Download aria-hidden />
            {dropTarget ? ru.library.dropHere(dropTarget) : ru.library.dropNeedGroup}
          </div>
        )}
      </section>

      {selected && <ArtPanel art={selected} characterTarget={characterTarget} />}

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
