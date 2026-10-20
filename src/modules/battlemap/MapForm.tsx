import { useState, type FormEvent } from "react";
import { ru } from "../../shared/i18n/ru";
import { Modal, TagEditor } from "../../shared/ui";
import { createModel, isValidSize, MAX_SIZE, MIN_SIZE } from "./domain/grid";
import type { BattlemapSummary } from "./repo";
import { useMapListStore } from "./store";

type MapFormMode =
  /** A new empty map (or one with a perimeter wall). */
  | { kind: "new" }
  /** Name, description and tags of an existing map or template. */
  | { kind: "edit"; map: BattlemapSummary }
  /** A new campaign map copied from a template. */
  | { kind: "fromTemplate"; template: BattlemapSummary };

interface MapFormProps {
  campaignId: string;
  mode: MapFormMode;
  onCreated?: (map: BattlemapSummary) => void;
  onClose: () => void;
}

export function MapForm({ campaignId, mode, onCreated, onClose }: MapFormProps) {
  const create = useMapListStore((s) => s.create);
  const createFromTemplate = useMapListStore((s) => s.createFromTemplate);
  const updateInfo = useMapListStore((s) => s.updateInfo);
  const source =
    mode.kind === "edit" ? mode.map : mode.kind === "fromTemplate" ? mode.template : null;
  const [name, setName] = useState(source?.name ?? "");
  const [description, setDescription] = useState(source?.description ?? "");
  const [tags, setTags] = useState<string[]>(source?.tags ?? []);
  const [width, setWidth] = useState("30");
  const [height, setHeight] = useState("20");
  const [perimeter, setPerimeter] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const w = Number(width);
  const h = Number(height);
  const nameError = name.trim() === "";
  const sizeError = mode.kind === "new" && (!isValidSize(w) || !isValidSize(h));
  const title =
    mode.kind === "new"
      ? ru.battlemap.newMap
      : mode.kind === "fromTemplate"
        ? ru.battlemap.templates.createTitle
        : mode.map.isTemplate
          ? ru.battlemap.templates.editInfo
          : ru.battlemap.editInfo;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (nameError || sizeError) return;
    setBusy(true);
    setFailure(null);
    try {
      const info = { name, description, tags };
      if (mode.kind === "edit") {
        await updateInfo(mode.map.id, info);
      } else if (mode.kind === "fromTemplate") {
        onCreated?.(await createFromTemplate(mode.template.id, campaignId, info));
      } else {
        onCreated?.(await create(campaignId, info, createModel(w, h, { perimeter })));
      }
      onClose();
    } catch (error) {
      setFailure(String(error));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </button>
          <button type="submit" form="map-form" className="primary" disabled={busy}>
            {mode.kind === "edit" ? ru.common.save : ru.common.create}
          </button>
        </>
      }
    >
      <form id="map-form" className="form" onSubmit={submit}>
        <label className="field">
          <span>{ru.battlemap.name}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={200} />
          {showErrors && nameError && <small className="error">{ru.battlemap.nameRequired}</small>}
        </label>
        {mode.kind === "fromTemplate" && (
          <p className="hint">
            {ru.battlemap.templates.createHint(
              ru.battlemap.sizeCells(mode.template.width, mode.template.height),
            )}
          </p>
        )}
        {mode.kind === "new" && (
          <>
            <div className="field-row">
              <label className="field">
                <span>{ru.battlemap.width}</span>
                <input
                  type="number"
                  min={MIN_SIZE}
                  max={MAX_SIZE}
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{ru.battlemap.height}</span>
                <input
                  type="number"
                  min={MIN_SIZE}
                  max={MAX_SIZE}
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </label>
            </div>
            {showErrors && sizeError && (
              <small className="error">{ru.battlemap.sizeError(MIN_SIZE, MAX_SIZE)}</small>
            )}
            <fieldset className="field radio-group">
              <span>{ru.battlemap.start}</span>
              <label>
                <input type="radio" checked={!perimeter} onChange={() => setPerimeter(false)} />
                {ru.battlemap.startEmpty}
              </label>
              <label>
                <input type="radio" checked={perimeter} onChange={() => setPerimeter(true)} />
                {ru.battlemap.startPerimeter}
              </label>
            </fieldset>
          </>
        )}
        <TagEditor label={ru.battlemap.tags} tags={tags} onChange={setTags} />
        <label className="field">
          <span>{ru.battlemap.description}</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        {failure && <p className="error">{failure}</p>}
      </form>
    </Modal>
  );
}
