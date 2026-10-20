import { useEffect, useMemo } from "react";
import {
  AudioWaveform,
  CircleAlert,
  Download,
  FolderOpen,
  FolderX,
  Headphones,
  Info,
  ListMusic,
  Music,
  Play,
  RefreshCw,
  SearchX,
  X,
} from "lucide-react";
import { ImportDialog } from "../../shared/catalog/ImportDialog";
import { toAbsolute } from "../../shared/catalog/paths";
import { fileUrl, pickDirectory } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { Button, EmptyState, IconButton, SearchInput, Segmented } from "../../shared/ui";
import { searchTracks } from "./domain/search";
import { trackName } from "./domain/tracks";
import type { Track } from "./domain/types";
import { MusicTree } from "./MusicTree";
import { usePlayerStore, type QueueItem } from "./player";
import { PlayerBar } from "./PlayerControls";
import { EditorScreen } from "./editor/EditorScreen";
import { addTrackToEditor } from "./editor/store";
import { useMusicStore, useSelectedTrack, type MusicTab } from "./store";
import { TrackList } from "./TrackList";
import { TrackPanel } from "./TrackPanel";
import { useMusicDrop } from "./useMusicDrop";

interface MusicScreenProps {
  musicRoot: string | null;
  /** The saved folder no longer exists. */
  rootMissing: boolean;
  onMusicRootChange: (path: string) => Promise<void>;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function MusicScreen({ musicRoot, rootMissing, onMusicRootChange }: MusicScreenProps) {
  async function pickRoot() {
    const path = await pickDirectory(ru.music.rootDialogTitle, musicRoot ?? undefined);
    if (path) await onMusicRootChange(path);
  }

  if (!musicRoot || rootMissing) {
    return (
      <EmptyState
        icon={rootMissing ? FolderX : Music}
        tone={rootMissing ? "error" : "default"}
        title={rootMissing ? ru.music.rootMissingTitle : ru.music.rootTitle}
        text={
          rootMissing && musicRoot
            ? ru.music.rootMissingText(musicRoot)
            : `${ru.music.rootText}\n${ru.music.rootHint}`
        }
        action={
          <Button variant="primary" icon={FolderOpen} onClick={() => void pickRoot()}>
            {ru.music.rootPick}
          </Button>
        }
      />
    );
  }
  return <MusicSection root={musicRoot} />;
}

/** "Слушать" (catalog and player) and "Редактировать" (the editor) share the music folder. */
function MusicSection({ root }: { root: string }) {
  const open = useMusicStore((s) => s.open);
  const storeRoot = useMusicStore((s) => s.root);
  const tab = useMusicStore((s) => s.tab);
  const setTab = useMusicStore((s) => s.setTab);

  useEffect(() => {
    void open(root);
  }, [open, root]);

  if (storeRoot !== root) return null;
  return (
    <div className="music">
      <div className="music-tabs">
        <Segmented<MusicTab>
          label={ru.music.title}
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "listen", label: ru.music.tabs.listen, icon: Headphones },
            { value: "edit", label: ru.music.tabs.edit, icon: AudioWaveform },
          ]}
        />
      </div>
      {tab === "listen" ? <MusicCatalog root={root} /> : <EditorScreen root={root} />}
    </div>
  );
}

function toQueue(root: string, tracks: readonly Track[]): QueueItem[] {
  return tracks.map((t) => ({
    trackId: t.id,
    title: trackName(t),
    url: fileUrl(toAbsolute(root, t.relPath)),
  }));
}

function MusicCatalog({ root }: { root: string }) {
  const entries = useMusicStore((s) => s.entries);
  const selection = useMusicStore((s) => s.selection);
  const query = useMusicStore((s) => s.query);
  const setQuery = useMusicStore((s) => s.setQuery);
  const syncing = useMusicStore((s) => s.syncing);
  const progress = useMusicStore((s) => s.progress);
  const syncErrors = useMusicStore((s) => s.syncErrors);
  const error = useMusicStore((s) => s.error);
  const sync = useMusicStore((s) => s.sync);
  const selectTrack = useMusicStore((s) => s.selectTrack);
  const selected = useSelectedTrack();
  const currentId = usePlayerStore((s) => s.current?.trackId ?? null);
  const playing = usePlayerStore((s) => s.playing);
  const playList = usePlayerStore((s) => s.playList);
  const drop = useMusicDrop();

  // Space toggles playback here, unless the user is typing or a dialog is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isEditable(e.target)) return;
      if (document.querySelector(".modal-backdrop")) return;
      e.preventDefault();
      usePlayerStore.getState().toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(
    () => searchTracks(entries, query, selection),
    [entries, query, selection],
  );

  /** Queues the visible list (without missing files), starting from `index`. */
  function play(index: number) {
    const picked = results[index];
    const playable = results.filter((t) => !t.missing);
    const start = picked ? playable.indexOf(picked) : 0;
    playList(toQueue(root, playable), Math.max(start, 0));
  }

  let status: string | null = null;
  if (progress) status = ru.music.syncProgress(progress.done, progress.total);
  else if (syncing) status = ru.music.syncing;
  const dropTarget = selection.kind === "collection" ? selection.collection : null;

  return (
    <>
      <div className="music-body">
        <MusicTree />

        <section className="music-main">
          <div className="toolbar music-toolbar">
            <SearchInput
              wrapperClassName="music-search"
              screenSearch
              placeholder={ru.music.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <span className="toolbar-count">{ru.music.count(results.length)}</span>
            <Button
              icon={Play}
              variant="ghost"
              onClick={() => play(0)}
              disabled={!results.some((t) => !t.missing)}
            >
              {ru.music.playAll}
            </Button>
            <span className="spacer" />
            {status && <span className="toolbar-status">{status}</span>}
            {syncErrors.length > 0 && (
              <span className="badge warning" title={syncErrors.slice(0, 20).join("\n")}>
                {ru.music.syncErrors(syncErrors.length)}
              </span>
            )}
            <IconButton
              icon={RefreshCw}
              label={ru.music.refresh}
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
          {selection.kind === "unsorted" && <p className="library-hint">{ru.music.unsortedHint}</p>}
          {selection.kind === "missing" && <p className="library-hint">{ru.music.missingHint}</p>}

          {results.length > 0 ? (
            <TrackList
              tracks={results}
              selectedId={selected?.id ?? null}
              currentId={currentId}
              playing={playing}
              showPlace={selection.kind !== "collection"}
              onSelect={(t) => selectTrack(t.id)}
              onPlay={play}
            />
          ) : (
            !syncing && (
              <EmptyState
                icon={query.trim() ? SearchX : ListMusic}
                title={ru.music.emptyTitle}
                text={
                  query.trim()
                    ? ru.music.noResults(query.trim())
                    : selection.kind === "collection"
                      ? ru.music.emptyCollection
                      : ru.music.emptySelection
                }
              />
            )
          )}

          {drop.dragging && (
            <div className={dropTarget ? "drop-overlay" : "drop-overlay blocked"}>
              <Download aria-hidden />
              {dropTarget ? ru.music.dropHere(dropTarget) : ru.music.dropNeedCollection}
            </div>
          )}
        </section>

        {selected && (
          <TrackPanel
            track={selected}
            onAddToEditor={() => addTrackToEditor(root, selected)}
            onPlay={() => {
              const index = results.findIndex((t) => t.id === selected.id);
              if (index >= 0) play(index);
              else playList(toQueue(root, [selected]), 0);
            }}
          />
        )}
      </div>

      <PlayerBar />

      {drop.pending && (
        <ImportDialog
          items={drop.pending.items}
          onRun={drop.resolvePending}
          onClose={drop.cancelPending}
        />
      )}
    </>
  );
}
