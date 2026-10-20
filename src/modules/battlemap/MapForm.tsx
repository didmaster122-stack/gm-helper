import { useState, type FormEvent } from "react";
import { ru } from "../../shared/i18n/ru";
import { Modal } from "../../shared/ui";
import { createModel, isValidSize, MAX_SIZE, MIN_SIZE } from "./domain/grid";
import type { BattlemapSummary } from "./repo";
import { useMapListStore } from "./store";

interface MapFormProps {
  campaignId: string;
  /** Edit name and description of this map; create a new one when omitted. */
  map?: BattlemapSummary;
  onCreated?: (map: BattlemapSummary) => void;
  onClose: () => void;
}

export function MapForm({ campaignId, map, onCreated, onClose }: MapFormProps) {
  const create = useMapListStore((s) => s.create);
  const updateInfo = useMapListStore((s) => s.updateInfo);
  const [name, setName] = useState(map?.name ?? "");
  const [description, setDescription] = useState(map?.description ?? "");
  const [width, setWidth] = useState("30");
  const [height, setHeight] = useState("20");
  const [perimeter, setPerimeter] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const w = Number(width);
  const h = Number(height);
  const nameError = name.trim() === "";
  const sizeError = !map && (!isValidSize(w) || !isValidSize(h));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (nameError || sizeError) return;
    setBusy(true);
    setFailure(null);
    try {
      const info = { name, description };
      if (map) {
        await updateInfo(map.id, info);
      } else {
        const created = await create(campaignId, info, createModel(w, h, { perimeter }));
        onCreated?.(created);
      }
      onClose();
    } catch (error) {
      setFailure(String(error));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={map ? ru.battlemap.editInfo : ru.battlemap.newMap}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </button>
          <button type="submit" form="map-form" className="primary" disabled={busy}>
            {map ? ru.common.save : ru.common.create}
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
        {!map && (
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
        <label className="field">
          <span>{ru.battlemap.description}</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        {failure && <p className="error">{failure}</p>}
      </form>
    </Modal>
  );
}
