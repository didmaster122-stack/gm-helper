import { useState } from "react";
import { FileX, FolderInput, FolderOpen, Pencil, Play, Trash, X } from "lucide-react";
import { nameError } from "../../shared/catalog/nameError";
import { joinRel, parentRel, splitExtension, toAbsolute } from "../../shared/catalog/paths";
import { revealInExplorer } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { Button, ConfirmDialog, IconButton, Modal, PromptDialog, TagEditor } from "../../shared/ui";
import { formatDuration, trackName } from "./domain/tracks";
import type { Track } from "./domain/types";
import { createMusicFolder, deleteTrack, moveTrack, renameTrack, saveTrackMeta } from "./service";
import { useMusicStore } from "./store";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

type Dialog = "rename" | "move" | "delete" | null;

export function TrackPanel({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const root = useMusicStore((s) => s.root);
  const tracks = useMusicStore((s) => s.tracks);
  const putTrack = useMusicStore((s) => s.putTrack);
  const selectTrack = useMusicStore((s) => s.selectTrack);
  const sync = useMusicStore((s) => s.sync);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const t = ru.music.track;
  if (!root) return null;

  const path = toAbsolute(root, track.relPath);
  const { base, ext } = splitExtension(track.fileName);
  const siblings = tracks
    .filter((x) => !x.missing && parentRel(x.relPath) === parentRel(track.relPath))
    .map((x) => x.fileName);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(String(e));
    }
  }

  const saveMeta = (meta: { displayName?: string | null; tags?: string[] }) =>
    run(async () =>
      putTrack(
        await saveTrackMeta(track, {
          displayName: meta.displayName !== undefined ? meta.displayName : track.displayName,
          tags: meta.tags ?? track.tags,
        }),
      ),
    );

  return (
    <aside className="side-panel track-panel" key={track.id}>
      <div className="panel-header">
        <h2>{trackName(track)}</h2>
        <IconButton icon={X} label={ru.common.close} onClick={() => selectTrack(null)} />
      </div>

      {track.missing ? (
        <div className="callout warning">
          <FileX aria-hidden />
          {t.missing}
        </div>
      ) : (
        <Button variant="primary" icon={Play} onClick={onPlay}>
          {t.play}
        </Button>
      )}

      <label className="field">
        <span>{t.displayName}</span>
        <input
          defaultValue={track.displayName ?? ""}
          placeholder={base}
          onBlur={(e) => {
            if ((e.target.value.trim() || null) !== track.displayName) {
              void saveMeta({ displayName: e.target.value });
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>

      <TagEditor label={t.tags} tags={track.tags} onChange={(tags) => void saveMeta({ tags })} />
      <small className="hint">{t.tagsHint}</small>

      <dl className="art-info">
        <dt>{t.file}</dt>
        <dd>{track.fileName}</dd>
        <dt>{t.location}</dt>
        <dd>{parentRel(track.relPath) || "—"}</dd>
        <dt>{t.duration}</dt>
        <dd>{formatDuration(track.durationMs)}</dd>
        <dt>{t.size}</dt>
        <dd>{formatSize(track.size)}</dd>
      </dl>

      {error && <p className="error">{error}</p>}

      <div className="panel-actions track-actions">
        {!track.missing && (
          <>
            <Button icon={Pencil} onClick={() => setDialog("rename")}>
              {t.rename}
            </Button>
            <Button icon={FolderInput} onClick={() => setDialog("move")}>
              {t.move}
            </Button>
            <Button icon={FolderOpen} onClick={() => void run(() => revealInExplorer(path))}>
              {t.reveal}
            </Button>
          </>
        )}
        <Button variant="danger" icon={Trash} onClick={() => setDialog("delete")}>
          {track.missing ? t.forget : t.delete}
        </Button>
      </div>

      {dialog === "rename" && (
        <PromptDialog
          title={t.renameTitle}
          label={t.newName}
          initialValue={base}
          confirmLabel={ru.common.save}
          validate={(v) => nameError(`${v.trim()}${ext}`, siblings, track.fileName)}
          onSubmit={async (name) => putTrack(await renameTrack(root, track, name))}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === "move" && <MoveDialog track={track} onClose={() => setDialog(null)} />}

      {dialog === "delete" && (
        <ConfirmDialog
          title={track.missing ? t.forgetTitle : t.deleteTitle}
          text={track.missing ? t.forgetText(track.fileName) : t.deleteText(track.fileName)}
          confirmLabel={track.missing ? t.forget : t.delete}
          danger
          onConfirm={async () => {
            await deleteTrack(root, track);
            selectTrack(null);
            await sync();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </aside>
  );
}

/** Select value for "create a new collection"; cannot clash with a folder name. */
const NEW_COLLECTION = "\u0000new";

function MoveDialog({ track, onClose }: { track: Track; onClose: () => void }) {
  const root = useMusicStore((s) => s.root);
  const tree = useMusicStore((s) => s.tree);
  const tracks = useMusicStore((s) => s.tracks);
  const putTrack = useMusicStore((s) => s.putTrack);
  const sync = useMusicStore((s) => s.sync);
  const t = ru.music.track;
  const collectionsOf = (name: string) => tree.tops.find((c) => c.name === name)?.subs ?? [];
  const defaultCollection = (name: string, preferred?: string | null) => {
    const list = collectionsOf(name);
    if (list.length === 0) return NEW_COLLECTION;
    return list.some((c) => c.name === preferred) ? (preferred ?? "") : (list[0]?.name ?? "");
  };

  const [category, setCategory] = useState(track.category ?? tree.tops[0]?.name ?? "");
  const [collection, setCollection] = useState(() => defaultCollection(category, track.collection));
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!root) return null;

  const collections = collectionsOf(category);
  const creating = collection === NEW_COLLECTION;
  const target = creating ? newName.trim() : collection;
  const newError = creating
    ? nameError(
        newName,
        collections.map((c) => c.name),
      )
    : null;
  const conflict =
    !creating &&
    tracks.some(
      (x) =>
        x.id !== track.id &&
        !x.missing &&
        x.relPath.toLowerCase() === `${category}/${collection}/${track.fileName}`.toLowerCase(),
    );

  const musicRoot = root;
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (creating) await createMusicFolder(musicRoot, joinRel(category, target));
      putTrack(await moveTrack(musicRoot, track, category, target));
      if (creating) void sync();
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t.moveTitle}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || !category || !!newError || conflict}
          >
            {t.moveConfirm}
          </Button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span>{t.category}</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCollection(defaultCollection(e.target.value));
            }}
          >
            {tree.tops.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t.collection}</span>
          <select value={collection} onChange={(e) => setCollection(e.target.value)}>
            {collections.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
            <option value={NEW_COLLECTION}>{t.newCollectionOption}</option>
          </select>
          {collections.length === 0 && <small>{t.noCollections(category)}</small>}
        </label>
        {creating && (
          <label className="field">
            <span>{t.newCollectionName}</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
            {newName !== "" && newError && <small className="error">{newError}</small>}
          </label>
        )}
        {conflict && <p className="error">{ru.catalog.nameErrors.exists}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}
