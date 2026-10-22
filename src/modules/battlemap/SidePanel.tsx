import { useMemo, useState } from "react";
import {
  Eraser,
  PaintBucket,
  Plus,
  RotateCw,
  SquareDashed,
  SquareMinus,
  SquarePlus,
  Trash,
  TriangleAlert,
  X,
} from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { MentionedIn } from "../../shared/mentions";
import { Button } from "../../shared/ui";
import { FLOOR, makeTypeLookup, type CellType } from "./domain/cellTypes";
import {
  addCellsToRegion,
  addRegion,
  deleteRegion,
  isConnected,
  paintCells,
  removeCellsFromRegion,
  updateRegion,
  type BattlemapModel,
  type Region,
} from "./domain/grid";
import { removeObjects, rotateObjects, type ObjectDef } from "./domain/objects";
import { useEditorStore } from "./store";
import { TypeSwatch } from "./TypeSwatch";

interface SidePanelProps {
  /** `null` for a template: templates belong to no campaign and are not mentioned. */
  mapId: string | null;
  model: BattlemapModel;
  types: CellType[];
  objectDefs: ObjectDef[];
}

/** Next free "Регион N" name. */
function nextRegionName(regions: readonly Region[]): string {
  const names = new Set(regions.map((r) => r.name));
  let n = regions.length + 1;
  while (names.has(ru.battlemap.regions.newName(n))) n++;
  return ru.battlemap.regions.newName(n);
}

export function SidePanel({ mapId, model, types, objectDefs }: SidePanelProps) {
  const selection = useEditorStore((s) => s.selection);
  const regionId = useEditorStore((s) => s.regionId);
  const typeId = useEditorStore((s) => s.typeId);
  const commit = useEditorStore((s) => s.commit);
  const setSelection = useEditorStore((s) => s.setSelection);
  const setRegion = useEditorStore((s) => s.setRegion);
  const typeOf = useMemo(() => makeTypeLookup(types), [types]);
  const region = model.regions.find((r) => r.id === regionId) ?? null;

  function createRegion() {
    const id = crypto.randomUUID();
    const props = {
      name: nextRegionName(model.regions),
      // An area only names the cells; a type can be chosen later.
      typeId: null,
      note: "",
      labelVisible: true,
    };
    commit(addRegion(model, id, props, selection));
    setSelection(new Set());
    setRegion(id);
  }

  return (
    <aside className="side-panel map-side">
      <ObjectsSection model={model} objectDefs={objectDefs} />
      <section className="map-side-section">
        <h3 className="subheading">{ru.battlemap.selection.title}</h3>
        {selection.size === 0 ? (
          <p className="hint">{ru.battlemap.selection.none}</p>
        ) : (
          <div className="map-side-actions">
            <span className="muted">{ru.battlemap.selection.count(selection.size)}</span>
            <Button variant="primary" icon={Plus} onClick={createRegion}>
              {ru.battlemap.selection.createRegion}
            </Button>
            <Button icon={PaintBucket} onClick={() => commit(paintCells(model, selection, typeId))}>
              {ru.battlemap.selection.assignType(typeOf(typeId).name)}
            </Button>
            <Button icon={Eraser} onClick={() => commit(paintCells(model, selection, FLOOR))}>
              {ru.battlemap.selection.clear}
            </Button>
            <Button icon={X} variant="ghost" onClick={() => setSelection(new Set())}>
              {ru.battlemap.selection.deselect}
            </Button>
          </div>
        )}
      </section>

      <section className="map-side-section map-side-regions">
        <h3 className="subheading">{ru.battlemap.regions.title}</h3>
        {model.regions.length === 0 ? (
          <p className="hint">{ru.battlemap.regions.none}</p>
        ) : (
          <ul className="region-list">
            {model.regions.map((r) => {
              const connected = isConnected(r.cells, model.width);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={r.id === regionId ? "region-item active" : "region-item"}
                    onClick={() => setRegion(r.id === regionId ? null : r.id)}
                  >
                    {r.typeId === null ? (
                      <span className="area-swatch" />
                    ) : (
                      <TypeSwatch type={typeOf(r.typeId)} size={16} />
                    )}
                    <span className="region-name">{r.name || "—"}</span>
                    {!connected && (
                      <TriangleAlert
                        className="region-warning"
                        aria-label={ru.battlemap.regions.disconnected}
                      />
                    )}
                    <span className="muted">{r.cells.length}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {region && (
          <RegionEditor
            // Remount when undo/redo changes the text so the fields show it.
            key={`${region.id}
${region.name}
${region.note}`}
            region={region}
            model={model}
            types={types}
            selection={selection}
          />
        )}
      </section>
      {mapId && (
        <section className="map-side-section">
          <MentionedIn kind="battlemap" id={mapId} />
        </section>
      )}
    </aside>
  );
}

interface RegionEditorProps {
  region: Region;
  model: BattlemapModel;
  types: CellType[];
  selection: ReadonlySet<number>;
}

function RegionEditor({ region, model, types, selection }: RegionEditorProps) {
  const commit = useEditorStore((s) => s.commit);
  const setSelection = useEditorStore((s) => s.setSelection);
  const setRegion = useEditorStore((s) => s.setRegion);
  // Text fields are committed on blur so that typing does not create an undo step per key.
  const [name, setName] = useState(region.name);
  const [note, setNote] = useState(region.note);
  const connected = isConnected(region.cells, model.width);

  function saveText() {
    const trimmed = name.trim();
    if (trimmed === region.name && note === region.note) return;
    commit(updateRegion(model, region.id, { name: trimmed, note }));
    setName(trimmed);
  }

  return (
    <div className="region-editor form">
      <label className="field">
        <span>{ru.battlemap.regions.name}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveText}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          maxLength={100}
        />
      </label>
      <label className="field">
        <span>{ru.battlemap.regions.type}</span>
        <select
          value={region.typeId ?? ""}
          onChange={(e) =>
            commit(updateRegion(model, region.id, { typeId: e.target.value || null }))
          }
        >
          <option value="">{ru.battlemap.regions.noType}</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{ru.battlemap.regions.note}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveText}
          rows={2}
        />
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={region.labelVisible}
          onChange={(e) =>
            commit(updateRegion(model, region.id, { labelVisible: e.target.checked }))
          }
        />
        {ru.battlemap.regions.showLabel}
      </label>
      <p className="muted">{ru.battlemap.regions.cells(region.cells.length)}</p>
      {!connected && (
        <div className="callout warning">
          <TriangleAlert aria-hidden />
          {ru.battlemap.regions.disconnected}
        </div>
      )}
      <div className="map-side-actions">
        <Button
          icon={SquarePlus}
          disabled={selection.size === 0}
          onClick={() => commit(addCellsToRegion(model, region.id, selection))}
        >
          {ru.battlemap.regions.addSelected}
        </Button>
        <Button
          icon={SquareMinus}
          disabled={selection.size === 0}
          onClick={() => commit(removeCellsFromRegion(model, region.id, selection))}
        >
          {ru.battlemap.regions.removeSelected}
        </Button>
        <Button icon={SquareDashed} onClick={() => setSelection(new Set(region.cells))}>
          {ru.battlemap.regions.selectCells}
        </Button>
        <Button
          variant="danger"
          icon={Trash}
          onClick={() => {
            commit(deleteRegion(model, region.id));
            setRegion(null);
          }}
        >
          {ru.battlemap.regions.delete}
        </Button>
      </div>
    </div>
  );
}

function ObjectsSection({ model, objectDefs }: { model: BattlemapModel; objectDefs: ObjectDef[] }) {
  const tool = useEditorStore((s) => s.tool);
  const objectDefId = useEditorStore((s) => s.objectDefId);
  const placeRotation = useEditorStore((s) => s.placeRotation);
  const selected = useEditorStore((s) => s.selectedObjects);
  const commit = useEditorStore((s) => s.commit);
  const setSelectedObjects = useEditorStore((s) => s.setSelectedObjects);
  const t = ru.battlemap.objects;
  const defById = useMemo(() => new Map(objectDefs.map((d) => [d.id, d])), [objectDefs]);

  if (selected.size === 0 && tool !== "object") return null;

  if (selected.size === 0) {
    const def = objectDefId ? defById.get(objectDefId) : undefined;
    return (
      <section className="map-side-section">
        <h3 className="subheading">{t.title}</h3>
        <p className="hint">{def ? t.placing(def.name, placeRotation) : t.pickInPalette}</p>
      </section>
    );
  }

  // "Стол × 3, Алтарь": names of the selected objects with counts.
  const counts = new Map<string, number>();
  for (const o of model.objects) {
    if (!selected.has(o.id)) continue;
    const name = defById.get(o.defId)?.name ?? t.missing;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const names = [...counts].map(([name, n]) => (n > 1 ? `${name} × ${n}` : name)).join(", ");
  const sizeOf = (id: string) => defById.get(id) ?? null;

  return (
    <section className="map-side-section">
      <h3 className="subheading">{t.title}</h3>
      <p className="muted">{names}</p>
      <div className="map-side-actions">
        <Button
          icon={RotateCw}
          shortcut="R"
          title={t.rotate}
          onClick={() => commit(rotateObjects(model, sizeOf, selected))}
        >
          {t.rotate}
        </Button>
        <Button
          variant="danger"
          icon={Trash}
          shortcut="Delete"
          title={t.delete}
          onClick={() => commit(removeObjects(model, selected))}
        >
          {t.delete}
        </Button>
        <Button variant="ghost" icon={X} onClick={() => setSelectedObjects(new Set())}>
          {ru.battlemap.selection.deselect}
        </Button>
      </div>
    </section>
  );
}
