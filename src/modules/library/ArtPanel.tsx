import { useState, type KeyboardEvent } from "react";
import { fileUrl, revealInExplorer } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { ConfirmDialog, Modal, PromptDialog } from "../../shared/ui";
import { artName, joinRel, parentRel, splitExtension, toAbsolute } from "./domain/paths";
import type { Art } from "./domain/types";
import { nameError } from "./nameError";
import { createLibraryFolder, deleteArt, moveArt, renameArt, saveArtMeta } from "./service";
import { useLibraryStore } from "./store";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

type Dialog = "rename" | "move" | "delete" | "full" | null;

export function ArtPanel({ art }: { art: Art }) {
  const root = useLibraryStore((s) => s.root);
  const arts = useLibraryStore((s) => s.arts);
  const putArt = useLibraryStore((s) => s.putArt);
  const sync = useLibraryStore((s) => s.sync);
  const selectArt = useLibraryStore((s) => s.selectArt);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  if (!root) return null;

  const path = toAbsolute(root, art.relPath);
  const { base, ext } = splitExtension(art.fileName);

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
      putArt(
        await saveArtMeta(art, {
          displayName: meta.displayName !== undefined ? meta.displayName : art.displayName,
          tags: meta.tags ?? art.tags,
        }),
      ),
    );

  const siblings = arts
    .filter((a) => !a.missing && parentRel(a.relPath) === parentRel(art.relPath))
    .map((a) => a.fileName);

  return (
    <aside className="art-panel" key={art.id}>
      <button
        type="button"
        className="art-preview"
        onClick={() => !art.missing && setDialog("full")}
        title={ru.library.art.openFull}
        disabled={art.missing}
      >
        {art.missing ? (
          <span className="warning">{ru.library.missing}</span>
        ) : (
          <img src={fileUrl(path)} alt="" />
        )}
      </button>

      <h2 className="art-title">{artName(art)}</h2>

      <label className="field">
        <span>{ru.library.art.displayName}</span>
        <input
          defaultValue={art.displayName ?? ""}
          placeholder={base}
          onBlur={(e) => {
            if ((e.target.value.trim() || null) !== art.displayName) {
              void saveMeta({ displayName: e.target.value });
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>

      <TagEditor tags={art.tags} onChange={(tags) => void saveMeta({ tags })} />

      <dl className="art-info">
        <dt>{ru.library.art.file}</dt>
        <dd>{art.fileName}</dd>
        <dt>{ru.library.art.location}</dt>
        <dd>{parentRel(art.relPath) || "—"}</dd>
        <dt>{ru.library.art.size}</dt>
        <dd>{formatSize(art.size)}</dd>
        {art.width && art.height && (
          <>
            <dt>{ru.library.art.dimensions}</dt>
            <dd>
              {art.width} × {art.height}
            </dd>
          </>
        )}
      </dl>

      {error && <p className="error">{error}</p>}

      <div className="art-actions">
        {!art.missing && (
          <>
            <button type="button" onClick={() => setDialog("rename")}>
              {ru.library.art.rename}
            </button>
            <button type="button" onClick={() => setDialog("move")}>
              {ru.library.art.move}
            </button>
            <button type="button" onClick={() => void run(() => revealInExplorer(path))}>
              {ru.library.art.reveal}
            </button>
          </>
        )}
        <button type="button" className="danger" onClick={() => setDialog("delete")}>
          {art.missing ? ru.library.art.forget : ru.library.art.delete}
        </button>
      </div>

      {dialog === "rename" && (
        <PromptDialog
          title={ru.library.art.renameTitle}
          label={ru.library.art.newName}
          initialValue={base}
          confirmLabel={ru.common.save}
          validate={(v) => nameError(`${v.trim()}${ext}`, siblings, art.fileName)}
          onSubmit={async (name) => putArt(await renameArt(root, art, name))}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === "move" && <MoveDialog art={art} onClose={() => setDialog(null)} />}

      {dialog === "delete" && (
        <ConfirmDialog
          title={art.missing ? ru.library.art.forgetTitle : ru.library.art.deleteTitle}
          text={
            art.missing
              ? ru.library.art.forgetText(art.fileName)
              : ru.library.art.deleteText(art.fileName)
          }
          confirmLabel={art.missing ? ru.library.art.forget : ru.library.art.delete}
          danger
          onConfirm={async () => {
            await deleteArt(root, art);
            selectArt(null);
            await sync();
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === "full" && (
        <Modal title={artName(art)} onClose={() => setDialog(null)}>
          <img className="art-full" src={fileUrl(path)} alt="" />
        </Modal>
      )}
    </aside>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add() {
    const tag = draft.trim();
    setDraft("");
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...tags, tag]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="field">
      <span>{ru.library.art.tags}</span>
      <div className="tag-editor">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button
              type="button"
              aria-label={ru.library.art.removeTag(tag)}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          placeholder={ru.library.art.addTag}
        />
      </div>
    </div>
  );
}

/** Select value for "create a new group"; cannot clash with a folder name. */
const NEW_GROUP = "\u0000new";

function MoveDialog({ art, onClose }: { art: Art; onClose: () => void }) {
  const root = useLibraryStore((s) => s.root);
  const tree = useLibraryStore((s) => s.tree);
  const arts = useLibraryStore((s) => s.arts);
  const putArt = useLibraryStore((s) => s.putArt);
  const sync = useLibraryStore((s) => s.sync);
  const groupsOf = (name: string) => tree.systems.find((s) => s.name === name)?.groups ?? [];
  const defaultGroup = (name: string, preferred?: string | null) => {
    const list = groupsOf(name);
    if (list.length === 0) return NEW_GROUP;
    return list.some((g) => g.name === preferred) ? (preferred ?? "") : (list[0]?.name ?? "");
  };

  const [system, setSystem] = useState(art.system ?? tree.systems[0]?.name ?? "");
  const [group, setGroup] = useState(() => defaultGroup(system, art.group));
  const [newGroup, setNewGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!root) return null;

  const groups = groupsOf(system);
  const creating = group === NEW_GROUP;
  const targetGroup = creating ? newGroup.trim() : group;
  const newGroupError = creating
    ? nameError(
        newGroup,
        groups.map((g) => g.name),
      )
    : null;
  const conflict =
    !creating &&
    arts.some(
      (a) =>
        a.id !== art.id &&
        !a.missing &&
        a.relPath.toLowerCase() === `${system}/${group}/${art.fileName}`.toLowerCase(),
    );

  const libraryRoot = root;
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (creating) await createLibraryFolder(libraryRoot, joinRel(system, targetGroup));
      putArt(await moveArt(libraryRoot, art, system, targetGroup));
      // A new folder only appears in the tree after a rescan.
      if (creating) void sync();
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={ru.library.art.moveTitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </button>
          <button
            type="button"
            className="primary"
            onClick={submit}
            disabled={busy || !system || !!newGroupError || conflict}
          >
            {ru.library.art.moveConfirm}
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span>{ru.library.art.system}</span>
          <select
            value={system}
            onChange={(e) => {
              setSystem(e.target.value);
              setGroup(defaultGroup(e.target.value));
            }}
          >
            {tree.systems.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{ru.library.art.group}</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name}
              </option>
            ))}
            <option value={NEW_GROUP}>{ru.library.art.newGroupOption}</option>
          </select>
          {groups.length === 0 && <small className="hint">{ru.library.art.noGroups(system)}</small>}
        </label>
        {creating && (
          <label className="field">
            <span>{ru.library.art.newGroupName}</span>
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} autoFocus />
            {newGroup !== "" && newGroupError && <small className="error">{newGroupError}</small>}
          </label>
        )}
        {conflict && <p className="error">{ru.library.nameErrors.exists}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}
