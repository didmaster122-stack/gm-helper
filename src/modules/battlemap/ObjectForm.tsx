import { useState, type FormEvent } from "react";
import { ru } from "../../shared/i18n/ru";
import { Modal } from "../../shared/ui";
import { isHexColor, type CellSymbol } from "./domain/cellTypes";
import {
  isValidObjectSize,
  MAX_OBJECT_SIZE,
  MIN_OBJECT_SIZE,
  type ObjectDef,
} from "./domain/objects";
import { useObjectStore } from "./objectStore";
import { ObjectSwatch } from "./ObjectSwatch";
import type { ObjectDefInput } from "./repo";
import { SymbolPicker } from "./SymbolPicker";

interface ObjectFormProps {
  /** Edit this catalog object; create a new one when omitted. */
  def?: ObjectDef;
  /** Called with the id of the created or edited object. */
  onSaved?: (id: string) => void;
  onClose: () => void;
}

/** Catalog object form, used in the settings and from the editor palette. */
export function ObjectForm({ def, onSaved, onClose }: ObjectFormProps) {
  const create = useObjectStore((s) => s.create);
  const update = useObjectStore((s) => s.update);
  const [name, setName] = useState(def?.name ?? "");
  const [width, setWidth] = useState(String(def?.width ?? 1));
  const [height, setHeight] = useState(String(def?.height ?? 1));
  const [color, setColor] = useState(def?.color ?? "#9b7a52");
  const [symbol, setSymbol] = useState<CellSymbol | null>(def?.symbol ?? null);
  const [blocksMove, setBlocksMove] = useState(def?.blocksMove ?? true);
  const [blocksSight, setBlocksSight] = useState(def?.blocksSight ?? false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const w = Number(width);
  const h = Number(height);
  const nameError = name.trim() === "";
  const sizeError = !isValidObjectSize(w) || !isValidObjectSize(h);
  const input: ObjectDefInput = {
    name,
    width: sizeError ? 1 : w,
    height: sizeError ? 1 : h,
    color: isHexColor(color) ? color : "#808080",
    symbol,
    blocksMove,
    blocksSight,
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (nameError || sizeError) return;
    setBusy(true);
    setFailure(null);
    try {
      let id = def?.id;
      if (id) await update(id, input);
      else id = await create(input);
      onSaved?.(id);
      onClose();
    } catch (error) {
      setFailure(String(error));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={def ? ru.objects.editTitle : ru.objects.newTitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </button>
          <button type="submit" form="object-form" className="primary" disabled={busy}>
            {def ? ru.common.save : ru.common.create}
          </button>
        </>
      }
    >
      <form id="object-form" className="form" onSubmit={submit}>
        <div className="type-form-head">
          <ObjectSwatch def={{ id: "preview", ...input }} size={56} />
          <label className="field">
            <span>{ru.objects.name}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={60}
            />
            {showErrors && nameError && <small className="error">{ru.objects.nameRequired}</small>}
          </label>
          <label className="field">
            <span>{ru.objects.color}</span>
            <input
              type="color"
              className="color-input"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>{ru.objects.width}</span>
            <input
              type="number"
              min={MIN_OBJECT_SIZE}
              max={MAX_OBJECT_SIZE}
              value={width}
              onChange={(e) => setWidth(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{ru.objects.height}</span>
            <input
              type="number"
              min={MIN_OBJECT_SIZE}
              max={MAX_OBJECT_SIZE}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
            />
          </label>
        </div>
        {showErrors && sizeError && (
          <small className="error">{ru.objects.sizeError(MIN_OBJECT_SIZE, MAX_OBJECT_SIZE)}</small>
        )}
        <SymbolPicker value={symbol} onChange={setSymbol} />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={blocksMove}
            onChange={(e) => setBlocksMove(e.target.checked)}
          />
          {ru.cellTypes.blocksMove}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={blocksSight}
            onChange={(e) => setBlocksSight(e.target.checked)}
          />
          {ru.cellTypes.blocksSight}
        </label>
        {failure && <p className="error">{failure}</p>}
      </form>
    </Modal>
  );
}
