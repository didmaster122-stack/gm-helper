import { useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { CellTypeForm } from "./CellTypeForm";
import type { CellType } from "./domain/cellTypes";
import type { ObjectDef } from "./domain/objects";
import { ObjectForm } from "./ObjectForm";
import { ObjectSwatch } from "./ObjectSwatch";
import { useEditorStore } from "./store";
import { TypeSwatch } from "./TypeSwatch";

interface PaletteProps {
  types: CellType[];
  objectDefs: ObjectDef[];
}

/** Left panel of the editor: cell types and catalog objects, both editable in place. */
export function Palette({ types, objectDefs }: PaletteProps) {
  const tool = useEditorStore((s) => s.tool);
  const typeId = useEditorStore((s) => s.typeId);
  const objectDefId = useEditorStore((s) => s.objectDefId);
  const setTool = useEditorStore((s) => s.setTool);
  const setType = useEditorStore((s) => s.setType);
  const setObjectDef = useEditorStore((s) => s.setObjectDef);
  const [typeForm, setTypeForm] = useState<CellType | "new" | null>(null);
  const [objectForm, setObjectForm] = useState<ObjectDef | "new" | null>(null);

  function pickType(id: string) {
    setType(id);
    if (tool !== "brush" && tool !== "rect" && tool !== "fill") setTool("brush");
  }

  return (
    <aside className="map-palette">
      <div className="palette-heading">
        <h3>{ru.battlemap.types}</h3>
        <button
          type="button"
          className="icon-button"
          title={ru.battlemap.palette.newType}
          aria-label={ru.battlemap.palette.newType}
          onClick={() => setTypeForm("new")}
        >
          +
        </button>
      </div>
      <ul>
        {types.map((t) => (
          <li key={t.id} className="palette-row">
            <button
              type="button"
              className={
                t.id === typeId && tool !== "object" ? "palette-item active" : "palette-item"
              }
              title={t.comment || undefined}
              onClick={() => pickType(t.id)}
            >
              <TypeSwatch type={t} />
              <span>{t.name}</span>
            </button>
            {!t.builtin && (
              <button
                type="button"
                className="palette-edit"
                title={ru.battlemap.palette.edit}
                aria-label={ru.battlemap.palette.edit}
                onClick={() => setTypeForm(t)}
              >
                ✎
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="palette-heading">
        <h3>{ru.battlemap.palette.objects}</h3>
        <button
          type="button"
          className="icon-button"
          title={ru.battlemap.palette.newObject}
          aria-label={ru.battlemap.palette.newObject}
          onClick={() => setObjectForm("new")}
        >
          +
        </button>
      </div>
      {objectDefs.length === 0 ? (
        <p className="hint">{ru.battlemap.palette.noObjects}</p>
      ) : (
        <ul>
          {objectDefs.map((d) => (
            <li key={d.id} className="palette-row">
              <button
                type="button"
                className={
                  d.id === objectDefId && tool === "object" ? "palette-item active" : "palette-item"
                }
                title={ru.battlemap.palette.objectHint}
                onClick={() => setObjectDef(d.id)}
              >
                <ObjectSwatch def={d} />
                <span>{d.name}</span>
                <span className="muted">{ru.objects.size(d.width, d.height)}</span>
              </button>
              <button
                type="button"
                className="palette-edit"
                title={ru.battlemap.palette.edit}
                aria-label={ru.battlemap.palette.edit}
                onClick={() => setObjectForm(d)}
              >
                ✎
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{ru.battlemap.hint}</p>

      {typeForm && (
        <CellTypeForm
          type={typeForm === "new" ? undefined : typeForm}
          onSaved={(id) => typeForm === "new" && pickType(id)}
          onClose={() => setTypeForm(null)}
        />
      )}
      {objectForm && (
        <ObjectForm
          def={objectForm === "new" ? undefined : objectForm}
          onSaved={(id) => objectForm === "new" && setObjectDef(id)}
          onClose={() => setObjectForm(null)}
        />
      )}
    </aside>
  );
}
