import { useEffect, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { Pencil, Plus, RotateCcw, Trash } from "lucide-react";
import { Button, ColorInput, ConfirmDialog, IconButton } from "../../shared/ui";
import { useCellTypeStore } from "./cellTypeStore";
import { CellTypeForm } from "./CellTypeForm";
import { BUILTIN_TYPES, type CellType } from "./domain/cellTypes";
import { LibraryContext } from "./libraryContext";
import { TypeSwatch } from "./TypeSwatch";

const DEFAULT_COLORS = new Map(BUILTIN_TYPES.map((t) => [t.id, t.color]));

function flagsText(t: CellType): string {
  const c = ru.cellTypes;
  const sight =
    t.blocksSight === "partial" ? c.sightPartial : t.blocksSight === "yes" ? c.yes : c.no;
  return `${c.blocksMove}: ${t.blocksMove ? c.yes : c.no} · ${c.blocksSight}: ${sight}`;
}

/** Settings section: built-in cell types (colour only) and custom types (full CRUD). */
export function CellTypesSettings({ libraryRoot }: { libraryRoot: string | null }) {
  const types = useCellTypeStore((s) => s.types);
  const load = useCellTypeStore((s) => s.load);
  const setBuiltinColor = useCellTypeStore((s) => s.setBuiltinColor);
  const remove = useCellTypeStore((s) => s.remove);
  const [editing, setEditing] = useState<CellType | "new" | null>(null);
  const [deleting, setDeleting] = useState<CellType | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const builtins = types.filter((t) => t.builtin);
  const custom = types.filter((t) => !t.builtin);

  return (
    <LibraryContext.Provider value={{ root: libraryRoot, system: null }}>
      <h3 className="subheading">{ru.cellTypes.builtin}</h3>
      <ul className="row-list type-list">
        {builtins.map((t) => {
          const changed = t.color !== DEFAULT_COLORS.get(t.id);
          return (
            <li key={t.id}>
              <TypeSwatch type={t} size={24} />
              <div className="row-info">
                <strong>{t.name}</strong>
                <div className="muted">{flagsText(t)}</div>
              </div>
              <div className="row-actions">
                <ColorInput
                  key={t.color}
                  value={t.color}
                  onCommit={(c) => void setBuiltinColor(t.id, c)}
                />
                {changed && (
                  <IconButton
                    icon={RotateCcw}
                    label={ru.cellTypes.resetColor}
                    onClick={() => void setBuiltinColor(t.id, null)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="settings-subhead">
        <h3 className="subheading">{ru.cellTypes.custom}</h3>
        <Button size="sm" icon={Plus} onClick={() => setEditing("new")}>
          {ru.cellTypes.add}
        </Button>
      </div>
      {custom.length === 0 ? (
        <p className="muted">{ru.cellTypes.noCustom}</p>
      ) : (
        <ul className="row-list type-list">
          {custom.map((t) => (
            <li key={t.id}>
              <TypeSwatch type={t} size={24} />
              <div className="row-info">
                <strong>{t.name}</strong>
                <div className="muted">{flagsText(t)}</div>
                {t.comment && <div className="type-comment">{t.comment}</div>}
              </div>
              <div className="row-actions">
                <IconButton icon={Pencil} label={ru.common.change} onClick={() => setEditing(t)} />
                <IconButton
                  icon={Trash}
                  label={ru.common.delete}
                  className="danger"
                  onClick={() => setDeleting(t)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <CellTypeForm
          type={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={ru.cellTypes.deleteTitle}
          text={ru.cellTypes.deleteText(deleting.name)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => remove(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </LibraryContext.Provider>
  );
}
