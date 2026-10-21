import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  Download,
  ImageOff,
  Info,
  Plus,
  RefreshCw,
  ScanFace,
  SearchX,
  X,
} from "lucide-react";
import { pickFiles } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { useRememberOpened } from "../../shared/recent";
import {
  Button,
  EmptyState,
  FilterChips,
  IconButton,
  MenuSelect,
  ScreenHeader,
  SearchInput,
} from "../../shared/ui";
import { ArtGrid } from "./ArtGrid";
import { ArtPanel, type CharacterTarget } from "./ArtPanel";
import { artName, IMAGE_EXTENSIONS } from "./domain/paths";
import { searchArts, sortArts, type ArtSort, type TokenFilter } from "./domain/search";
import type { Art, LibrarySelection } from "./domain/types";
import { ImportDialog } from "../../shared/catalog/ImportDialog";
import { MissingBar } from "../../shared/catalog/MissingBar";
import { LibraryTree } from "./LibraryTree";
import { forgetMissingArts } from "./service";
import { useLibraryStore, useSelectedArt } from "./store";
import { TokenEditor } from "./TokenEditor";
import { useDropImport } from "./useDropImport";

const TOKEN_FILTERS: readonly TokenFilter[] = ["any", "with", "without"];
const SORTS: readonly ArtSort[] = ["name", "added", "tokens"];

function selectionPath(selection: LibrarySelection): string[] {
  switch (selection.kind) {
    case "all":
      return [];
    case "unsorted":
      return [ru.library.unsorted];
    case "missing":
      return [ru.library.missingList];
    case "system":
      return [selection.system];
    case "group":
      return [selection.system, selection.group];
  }
}

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
  const sort = useLibraryStore((s) => s.sort);
  const setSort = useLibraryStore((s) => s.setSort);
  const syncing = useLibraryStore((s) => s.syncing);
  const progress = useLibraryStore((s) => s.progress);
  const syncErrors = useLibraryStore((s) => s.syncErrors);
  const error = useLibraryStore((s) => s.error);
  const sync = useLibraryStore((s) => s.sync);
  const selectArt = useLibraryStore((s) => s.selectArt);
  const openArt = useLibraryStore((s) => s.openArt);
  const panelOpen = useLibraryStore((s) => s.panelOpen);
  const putTokens = useLibraryStore((s) => s.putTokens);
  const arts = useLibraryStore((s) => s.arts);
  const selected = useSelectedArt();
  const drop = useDropImport();
  const [tokenFor, setTokenFor] = useState<Art | null>(null);
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

  const searching = query.trim() !== "";
  const results = useMemo(() => {
    const found = searchArts(entries, query, selection, {
      filter: tokenFilter,
      artsWithTokens: new Set(tokensByArt.keys()),
    });
    // A search keeps its relevance order; browsing follows the chosen sort.
    return searching ? found : sortArts(found, sort, (id) => tokensByArt.get(id)?.length ?? 0);
  }, [entries, query, selection, tokenFilter, tokensByArt, sort, searching]);

  if (root !== libraryRoot) return null;

  let status: string | null = null;
  if (progress) status = ru.library.syncProgress(progress.done, progress.total);
  else if (syncing) status = ru.library.syncing;

  const dropTarget = selection.kind === "group" ? selection.group : null;
  const withTokens = results.filter((a) => tokensByArt.has(a.id)).length;
  const campaignSystem =
    preferredSystem && tree.systems.some((s) => s.name === preferredSystem)
      ? preferredSystem
      : null;
  const selectedTokens = selected ? (tokensByArt.get(selected.id)?.length ?? 0) : 0;

  async function addArts() {
    const paths = await pickFiles(ru.library.addArtDialogTitle, [
      { name: ru.library.imageFilter, extensions: IMAGE_EXTENSIONS.map((e) => e.slice(1)) },
    ]);
    await drop.importPaths(paths);
  }

  return (
    <div className="library">
      <div className="library-head">
        <ScreenHeader
          title={ru.library.title}
          path={selectionPath(selection)}
          summary={ru.library.summary(results.length, withTokens, campaignSystem)}
          actions={
            <>
              <SearchInput
                wrapperClassName="library-search"
                screenSearch
                placeholder={ru.library.searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              <IconButton
                icon={RefreshCw}
                label={ru.library.refresh}
                className={syncing ? "spinning" : undefined}
                onClick={() => void sync()}
                disabled={syncing}
              />
              <Button
                variant={selected ? "secondary" : "primary"}
                icon={Plus}
                disabled={!dropTarget}
                title={dropTarget ? undefined : ru.library.addArtNeedGroup}
                onClick={() => void addArts()}
              >
                {ru.library.addArt}
              </Button>
            </>
          }
        />
        <div className="library-tools">
          <FilterChips
            label={ru.library.filter.label}
            value={tokenFilter}
            onChange={setTokenFilter}
            options={TOKEN_FILTERS.map((f) => ({ value: f, label: ru.library.filter[f] }))}
          />
          <span className="spacer" />
          {status && <span className="toolbar-status">{status}</span>}
          {syncErrors.length > 0 && (
            <span className="badge warning" title={syncErrors.slice(0, 20).join("\n")}>
              {ru.library.syncErrors(syncErrors.length)}
            </span>
          )}
          <MenuSelect
            label={ru.library.sort.label}
            buttonLabel={ru.library.sort.button(ru.library.sort[sort])}
            value={sort}
            onChange={setSort}
            options={SORTS.map((s) => ({ value: s, label: ru.library.sort[s] }))}
            disabled={searching}
            title={searching ? ru.library.sort.byRelevance : undefined}
          />
        </div>
      </div>

      {selected && (
        <div className="library-selbar">
          <span className="library-selbar-name">{artName(selected)}</span>
          <span className="library-selbar-meta">
            {selected.missing ? ru.library.missing : ru.library.selected.tokens(selectedTokens)}
          </span>
          <span className="spacer" />
          {!panelOpen && (
            <Button onClick={() => openArt(selected.id)}>{ru.library.selected.open}</Button>
          )}
          {!selected.missing && (
            <Button variant="primary" icon={ScanFace} onClick={() => setTokenFor(selected)}>
              {ru.library.token.create}
            </Button>
          )}
          <IconButton icon={X} label={ru.library.selected.clear} onClick={() => selectArt(null)} />
        </div>
      )}

      <div className="library-body">
        <LibraryTree preferredSystem={preferredSystem} />

        <section className="library-main">
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
          {selection.kind === "unsorted" && (
            <p className="library-hint">{ru.library.unsortedHint}</p>
          )}
          {selection.kind === "missing" && (
            <MissingBar
              hint={ru.library.missingHint}
              buttonLabel={ru.library.forgetMissing}
              confirmTitle={ru.library.forgetMissingTitle}
              confirmText={ru.library.forgetMissingText(
                tree.missing,
                arts.reduce(
                  (n, a) => n + (a.missing ? (tokensByArt.get(a.id)?.length ?? 0) : 0),
                  0,
                ),
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
              onSelect={(art) => selectArt(art.id === selected?.id && !panelOpen ? null : art.id)}
              onActivate={(art) => openArt(art.id)}
              tokensByArt={tokensByArt}
            />
          ) : (
            !syncing && (
              <EmptyState
                icon={searching ? SearchX : ImageOff}
                title={ru.library.emptyTitle}
                text={
                  searching
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

        {selected && panelOpen && <ArtPanel art={selected} characterTarget={characterTarget} />}
      </div>

      {tokenFor && (
        <TokenEditor
          root={libraryRoot}
          art={tokenFor}
          title={ru.library.token.createTitle}
          onSaved={(t) => {
            putTokens([t]);
            openArt(tokenFor.id);
          }}
          onClose={() => setTokenFor(null)}
        />
      )}

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
