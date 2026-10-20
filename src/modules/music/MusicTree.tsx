import { useState } from "react";
import {
  ChevronRight,
  FileX,
  FolderInput,
  ListMusic,
  Music,
  Pencil,
  Plus,
  Trash,
  type LucideIcon,
} from "lucide-react";
import { nameError } from "../../shared/catalog/nameError";
import { joinRel } from "../../shared/catalog/paths";
import { ru } from "../../shared/i18n/ru";
import { ConfirmDialog, IconButton, PromptDialog } from "../../shared/ui";
import { trackName } from "./domain/tracks";
import type { MusicSelection } from "./domain/types";
import { createMusicFolder, deleteMusicFolder, renameMusicFolder, tracksInFolder } from "./service";
import { useMusicStore } from "./store";

type Dialog =
  | { kind: "create"; parent: string }
  | { kind: "rename"; relPath: string; name: string }
  | { kind: "delete"; relPath: string; name: string };

function same(a: MusicSelection, b: MusicSelection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Category → collection tree with folder management (spec §6.2). */
export function MusicTree() {
  const root = useMusicStore((s) => s.root);
  const tree = useMusicStore((s) => s.tree);
  const tracks = useMusicStore((s) => s.tracks);
  const selection = useMusicStore((s) => s.selection);
  const setSelection = useMusicStore((s) => s.setSelection);
  const sync = useMusicStore((s) => s.sync);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const t = ru.music;

  if (!root) return null;

  const siblingsOf = (parent: string): string[] =>
    parent === ""
      ? tree.tops.map((c) => c.name)
      : (tree.tops.find((c) => c.name === parent)?.subs.map((s) => s.name) ?? []);

  const item = (
    label: string,
    count: number,
    target: MusicSelection,
    Icon: LucideIcon | null,
    extra = "",
  ) => (
    <button
      type="button"
      className={`tree-item ${extra} ${same(selection, target) ? "active" : ""}`}
      onClick={() => setSelection(target)}
      aria-current={same(selection, target) || undefined}
    >
      {Icon && <Icon className="tree-icon" aria-hidden />}
      <span className="tree-label">{label}</span>
      <span className="tree-count">{count}</span>
    </button>
  );

  const actions = (relPath: string, name: string, canAddCollection: boolean) => (
    <span className="tree-actions">
      {canAddCollection && (
        <IconButton
          icon={Plus}
          size="sm"
          label={t.newCollection}
          onClick={() => setDialog({ kind: "create", parent: relPath })}
        />
      )}
      <IconButton
        icon={Pencil}
        size="sm"
        label={ru.catalog.renameFolder}
        onClick={() => setDialog({ kind: "rename", relPath, name })}
      />
      <IconButton
        icon={Trash}
        size="sm"
        label={ru.catalog.deleteFolder}
        onClick={() => setDialog({ kind: "delete", relPath, name })}
      />
    </span>
  );

  const toggle = (name: string) => {
    const next = new Set(collapsed);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setCollapsed(next);
  };

  const libraryRoot = root;
  const inside = dialog?.kind === "delete" ? tracksInFolder(dialog.relPath, tracks) : [];
  const shown = inside.slice(0, 10).map((tr) => `• ${trackName(tr)}`);
  if (inside.length > shown.length) shown.push(ru.catalog.andMore(inside.length - shown.length));

  return (
    <aside className="catalog-tree">
      {item(t.all, tree.total, { kind: "all" }, Music)}
      {tree.unsorted > 0 &&
        item(t.unsorted, tree.unsorted, { kind: "unsorted" }, FolderInput, "muted")}
      {tree.missing > 0 && item(t.missingList, tree.missing, { kind: "missing" }, FileX, "warning")}

      <div className="tree-heading">
        <span>{t.categories}</span>
        <IconButton
          icon={Plus}
          size="sm"
          label={t.newCategory}
          onClick={() => setDialog({ kind: "create", parent: "" })}
        />
      </div>

      {tree.tops.map((category) => (
        <div key={category.name}>
          <div className="tree-row">
            <button
              type="button"
              className="tree-toggle"
              onClick={() => toggle(category.name)}
              aria-expanded={!collapsed.has(category.name)}
              aria-label={category.name}
            >
              <ChevronRight aria-hidden />
            </button>
            {item(
              category.name,
              category.count,
              { kind: "category", category: category.name },
              null,
            )}
            {actions(category.name, category.name, true)}
          </div>
          {!collapsed.has(category.name) &&
            category.subs.map((collection) => (
              <div key={collection.name} className="tree-row tree-group">
                {item(
                  collection.name,
                  collection.count,
                  { kind: "collection", category: category.name, collection: collection.name },
                  ListMusic,
                )}
                {actions(joinRel(category.name, collection.name), collection.name, false)}
              </div>
            ))}
        </div>
      ))}

      {dialog?.kind === "create" && (
        <PromptDialog
          title={dialog.parent === "" ? t.newCategory : t.newCollection}
          label={ru.catalog.folderName}
          confirmLabel={ru.common.create}
          validate={(v) => nameError(v, siblingsOf(dialog.parent))}
          onSubmit={async (name) => {
            await createMusicFolder(libraryRoot, joinRel(dialog.parent, name));
            await sync();
            setSelection(
              dialog.parent === ""
                ? { kind: "category", category: name }
                : { kind: "collection", category: dialog.parent, collection: name },
            );
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "rename" && (
        <PromptDialog
          title={ru.catalog.renameFolder}
          label={ru.catalog.folderName}
          initialValue={dialog.name}
          confirmLabel={ru.common.save}
          validate={(v) => {
            const parent = dialog.relPath.includes("/") ? dialog.relPath.split("/")[0]! : "";
            return nameError(v, siblingsOf(parent), dialog.name);
          }}
          onSubmit={async (name) => {
            await renameMusicFolder(libraryRoot, dialog.relPath, name, tracks);
            setSelection({ kind: "all" });
            await sync();
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={ru.catalog.deleteFolder}
          text={
            inside.length === 0
              ? ru.catalog.deleteEmptyFolderText(dialog.name)
              : ru.catalog.deleteFolderText(dialog.name, inside.length, shown.join("\n"))
          }
          confirmLabel={ru.common.delete}
          danger
          onConfirm={async () => {
            await deleteMusicFolder(libraryRoot, dialog.relPath, tracks);
            setSelection({ kind: "all" });
            await sync();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </aside>
  );
}
