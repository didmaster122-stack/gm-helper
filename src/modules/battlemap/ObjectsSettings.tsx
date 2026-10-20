import { useEffect, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { Pencil, Plus, Trash } from "lucide-react";
import { Button, ConfirmDialog, IconButton } from "../../shared/ui";
import type { ObjectDef } from "./domain/objects";
import { LibraryContext } from "./libraryContext";
import { ObjectForm } from "./ObjectForm";
import { useObjectStore } from "./objectStore";
import { ObjectSwatch } from "./ObjectSwatch";

function objectFlagsText(d: ObjectDef): string {
  const c = ru.cellTypes;
  return `${c.blocksMove}: ${d.blocksMove ? c.yes : c.no} · ${c.blocksSight}: ${d.blocksSight ? c.yes : c.no}`;
}

interface ObjectsSettingsProps {
  /** Library root for pictures from the art library. */
  libraryRoot: string | null;
}

/** Settings section: the app-wide catalog of map objects. */
export function ObjectsSettings({ libraryRoot }: ObjectsSettingsProps) {
  const defs = useObjectStore((s) => s.defs);
  const load = useObjectStore((s) => s.load);
  const remove = useObjectStore((s) => s.remove);
  const [editing, setEditing] = useState<ObjectDef | "new" | null>(null);
  const [deleting, setDeleting] = useState<ObjectDef | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <LibraryContext.Provider value={{ root: libraryRoot, system: null }}>
      <div className="settings-subhead">
        <p className="hint">{ru.objects.hint}</p>
        <Button size="sm" icon={Plus} onClick={() => setEditing("new")}>
          {ru.objects.add}
        </Button>
      </div>
      {defs.length === 0 ? (
        <p className="muted">{ru.objects.none}</p>
      ) : (
        <ul className="row-list type-list">
          {defs.map((d) => (
            <li key={d.id}>
              <ObjectSwatch def={d} size={32} />
              <div className="row-info">
                <strong>
                  {d.name} <span className="muted">{ru.objects.size(d.width, d.height)}</span>
                </strong>
                <div className="muted">{objectFlagsText(d)}</div>
              </div>
              <div className="row-actions">
                <IconButton icon={Pencil} label={ru.common.change} onClick={() => setEditing(d)} />
                <IconButton
                  icon={Trash}
                  label={ru.common.delete}
                  className="danger"
                  onClick={() => setDeleting(d)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ObjectForm
          def={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={ru.objects.deleteTitle}
          text={ru.objects.deleteText(deleting.name)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => remove(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </LibraryContext.Provider>
  );
}
