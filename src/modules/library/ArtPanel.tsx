import { useState } from "react";
import { FolderInput, FolderOpen, ImageOff, Pencil, Trash, UserPlus, X } from "lucide-react";
import { fileUrl, revealInExplorer } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { Button, ConfirmDialog, IconButton, Modal, PromptDialog, TagEditor } from "../../shared/ui";
import { artName, joinRel, parentRel, splitExtension, toAbsolute } from "./domain/paths";
import type { Art } from "./domain/types";
import { nameError } from "./nameError";
import { createLibraryFolder, deleteArt, moveArt, renameArt, saveArtMeta } from "./service";
import { useArtTokens, useLibraryStore } from "./store";
import { TokensSection } from "./TokensSection";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

type Dialog = "rename" | "move" | "delete" | "full" | null;

/** Campaign that receives characters made from arts ("Create character", spec §4.1). */
export interface CharacterTarget {
  campaignName: string;
  /** `tokenId` is the art's first token, if any. */
  create: (name: string, artId: string, tokenId: string | null) => Promise<void> | void;
}

export function ArtPanel({
  art,
  characterTarget,
}: {
  art: Art;
  characterTarget: CharacterTarget | null;
}) {
  const root = useLibraryStore((s) => s.root);
  const arts = useLibraryStore((s) => s.arts);
  const putArt = useLibraryStore((s) => s.putArt);
  const putTokens = useLibraryStore((s) => s.putTokens);
  const sync = useLibraryStore((s) => s.sync);
  const selectArt = useLibraryStore((s) => s.selectArt);
  const tokens = useArtTokens(art.id);
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
    <aside className="side-panel art-panel" key={art.id}>
      <div className="panel-header">
        <h2 className="art-title">{artName(art)}</h2>
        <IconButton icon={X} label={ru.common.close} onClick={() => selectArt(null)} />
      </div>

      <button
        type="button"
        className="art-preview"
        onClick={() => !art.missing && setDialog("full")}
        title={ru.library.art.openFull}
        disabled={art.missing}
      >
        {art.missing ? (
          <span className="art-preview-missing">
            <ImageOff aria-hidden />
            {ru.library.missing}
          </span>
        ) : (
          <img src={fileUrl(path)} alt="" />
        )}
      </button>

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

      <TagEditor
        label={ru.library.art.tags}
        tags={art.tags}
        onChange={(tags) => void saveMeta({ tags })}
      />

      <TokensSection root={root} art={art} />

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
        {!art.missing && characterTarget && (
          <Button
            variant="primary"
            icon={UserPlus}
            className="art-action-main"
            title={ru.relations.character.createFromArtHint(characterTarget.campaignName)}
            onClick={() =>
              void run(async () =>
                characterTarget.create(artName(art), art.id, tokens[0]?.id ?? null),
              )
            }
          >
            {ru.relations.character.createFromArt}
          </Button>
        )}
        {!art.missing && (
          <>
            <Button icon={Pencil} onClick={() => setDialog("rename")}>
              {ru.library.art.rename}
            </Button>
            <Button icon={FolderInput} onClick={() => setDialog("move")}>
              {ru.library.art.move}
            </Button>
            <Button icon={FolderOpen} onClick={() => void run(() => revealInExplorer(path))}>
              {ru.library.art.reveal}
            </Button>
          </>
        )}
        <Button variant="danger" icon={Trash} onClick={() => setDialog("delete")}>
          {art.missing ? ru.library.art.forget : ru.library.art.delete}
        </Button>
      </div>

      {dialog === "rename" && (
        <PromptDialog
          title={ru.library.art.renameTitle}
          label={ru.library.art.newName}
          initialValue={base}
          confirmLabel={ru.common.save}
          validate={(v) => nameError(`${v.trim()}${ext}`, siblings, art.fileName)}
          onSubmit={async (name) => {
            const result = await renameArt(root, art, tokens, name);
            putArt(result.art);
            putTokens(result.tokens);
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === "move" && <MoveDialog art={art} onClose={() => setDialog(null)} />}

      {dialog === "delete" && (
        <ConfirmDialog
          title={art.missing ? ru.library.art.forgetTitle : ru.library.art.deleteTitle}
          text={
            art.missing
              ? ru.library.art.forgetText(art.fileName, tokens.length)
              : ru.library.art.deleteText(art.fileName, tokens.length)
          }
          confirmLabel={art.missing ? ru.library.art.forget : ru.library.art.delete}
          danger
          onConfirm={async () => {
            await deleteArt(root, art, tokens);
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

/** Select value for "create a new group"; cannot clash with a folder name. */
const NEW_GROUP = "\u0000new";

function MoveDialog({ art, onClose }: { art: Art; onClose: () => void }) {
  const root = useLibraryStore((s) => s.root);
  const tree = useLibraryStore((s) => s.tree);
  const arts = useLibraryStore((s) => s.arts);
  const putArt = useLibraryStore((s) => s.putArt);
  const putTokens = useLibraryStore((s) => s.putTokens);
  const sync = useLibraryStore((s) => s.sync);
  const tokens = useArtTokens(art.id);
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
      const result = await moveArt(libraryRoot, art, tokens, system, targetGroup);
      putArt(result.art);
      putTokens(result.tokens);
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
