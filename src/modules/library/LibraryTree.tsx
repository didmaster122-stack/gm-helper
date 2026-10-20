import { useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { ConfirmDialog, PromptDialog } from "../../shared/ui";
import { artName, joinRel } from "./domain/paths";
import type { LibrarySelection } from "./domain/types";
import { nameError } from "./nameError";
import {
  artsInFolder,
  createLibraryFolder,
  deleteLibraryFolder,
  renameLibraryFolder,
} from "./service";
import { useLibraryStore } from "./store";

type Dialog =
  | { kind: "create"; parent: string }
  | { kind: "rename"; relPath: string; name: string }
  | { kind: "delete"; relPath: string; name: string };

function same(a: LibrarySelection, b: LibrarySelection): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function LibraryTree() {
  const root = useLibraryStore((s) => s.root);
  const tree = useLibraryStore((s) => s.tree);
  const arts = useLibraryStore((s) => s.arts);
  const tokens = useLibraryStore((s) => s.tokens);
  const selection = useLibraryStore((s) => s.selection);
  const setSelection = useLibraryStore((s) => s.setSelection);
  const sync = useLibraryStore((s) => s.sync);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (!root) return null;

  const siblingsOf = (parent: string): string[] =>
    parent === ""
      ? tree.systems.map((s) => s.name)
      : (tree.systems.find((s) => s.name === parent)?.groups.map((g) => g.name) ?? []);

  const item = (label: string, count: number, target: LibrarySelection, extra = "") => (
    <button
      type="button"
      className={`tree-item ${extra} ${same(selection, target) ? "active" : ""}`}
      onClick={() => setSelection(target)}
    >
      <span className="tree-label">{label}</span>
      <span className="tree-count">{count}</span>
    </button>
  );

  const actions = (relPath: string, name: string, canAddGroup: boolean) => (
    <span className="tree-actions">
      {canAddGroup && (
        <button
          type="button"
          title={ru.library.newGroup}
          onClick={() => setDialog({ kind: "create", parent: relPath })}
        >
          +
        </button>
      )}
      <button
        type="button"
        title={ru.library.renameFolder}
        onClick={() => setDialog({ kind: "rename", relPath, name })}
      >
        ✎
      </button>
      <button
        type="button"
        title={ru.library.deleteFolder}
        onClick={() => setDialog({ kind: "delete", relPath, name })}
      >
        ×
      </button>
    </span>
  );

  const toggle = (name: string) => {
    const next = new Set(collapsed);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setCollapsed(next);
  };

  return (
    <aside className="library-tree">
      {item(ru.library.all, tree.total, { kind: "all" })}
      {tree.unsorted > 0 && item(ru.library.unsorted, tree.unsorted, { kind: "unsorted" }, "muted")}
      {tree.missing > 0 &&
        item(ru.library.missingList, tree.missing, { kind: "missing" }, "warning")}

      <div className="tree-heading">
        <span>{ru.library.systems}</span>
        <button
          type="button"
          title={ru.library.newSystem}
          onClick={() => setDialog({ kind: "create", parent: "" })}
        >
          +
        </button>
      </div>

      {tree.systems.map((system) => (
        <div key={system.name} className="tree-system">
          <div className="tree-row">
            <button
              type="button"
              className="tree-toggle"
              onClick={() => toggle(system.name)}
              aria-expanded={!collapsed.has(system.name)}
            >
              {collapsed.has(system.name) ? "▸" : "▾"}
            </button>
            {item(system.name, system.count, { kind: "system", system: system.name })}
            {actions(system.name, system.name, true)}
          </div>
          {!collapsed.has(system.name) &&
            system.groups.map((group) => (
              <div key={group.name} className="tree-row tree-group">
                {item(group.name, group.count, {
                  kind: "group",
                  system: system.name,
                  group: group.name,
                })}
                {actions(joinRel(system.name, group.name), group.name, false)}
              </div>
            ))}
        </div>
      ))}

      {dialog?.kind === "create" && (
        <PromptDialog
          title={dialog.parent === "" ? ru.library.newSystem : ru.library.newGroup}
          label={ru.library.folderName}
          confirmLabel={ru.common.create}
          validate={(v) => nameError(v, siblingsOf(dialog.parent))}
          onSubmit={async (name) => {
            await createLibraryFolder(root, joinRel(dialog.parent, name));
            await sync();
            setSelection(
              dialog.parent === ""
                ? { kind: "system", system: name }
                : { kind: "group", system: dialog.parent, group: name },
            );
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "rename" && (
        <PromptDialog
          title={ru.library.renameFolder}
          label={ru.library.folderName}
          initialValue={dialog.name}
          confirmLabel={ru.common.save}
          validate={(v) => {
            const parent = dialog.relPath.includes("/") ? dialog.relPath.split("/")[0]! : "";
            return nameError(v, siblingsOf(parent), dialog.name);
          }}
          onSubmit={async (name) => {
            await renameLibraryFolder(root, dialog.relPath, name, arts, tokens);
            setSelection({ kind: "all" });
            await sync();
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "delete" && (
        <DeleteFolderDialog
          relPath={dialog.relPath}
          name={dialog.name}
          onClose={() => setDialog(null)}
        />
      )}
    </aside>
  );
}

function DeleteFolderDialog({
  relPath,
  name,
  onClose,
}: {
  relPath: string;
  name: string;
  onClose: () => void;
}) {
  const root = useLibraryStore((s) => s.root);
  const arts = useLibraryStore((s) => s.arts);
  const tokens = useLibraryStore((s) => s.tokens);
  const setSelection = useLibraryStore((s) => s.setSelection);
  const sync = useLibraryStore((s) => s.sync);
  if (!root) return null;

  const inside = artsInFolder(relPath, arts);
  const shown = inside.slice(0, 10).map((a) => `• ${artName(a)}`);
  if (inside.length > shown.length) shown.push(ru.library.andMore(inside.length - shown.length));

  return (
    <ConfirmDialog
      title={ru.library.deleteFolder}
      text={
        inside.length === 0
          ? ru.library.deleteEmptyFolderText(name)
          : ru.library.deleteFolderText(name, inside.length, shown.join("\n"))
      }
      confirmLabel={ru.common.delete}
      danger
      onConfirm={async () => {
        await deleteLibraryFolder(root, relPath, arts, tokens);
        setSelection({ kind: "all" });
        await sync();
      }}
      onClose={onClose}
    />
  );
}
