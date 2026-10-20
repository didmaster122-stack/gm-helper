import { useState, type FormEvent } from "react";
import { ru } from "../../shared/i18n/ru";
import { Modal } from "../../shared/ui";
import { useCellTypeStore } from "./cellTypeStore";
import { isHexColor, type CellSymbol, type CellType } from "./domain/cellTypes";
import type { CustomTypeInput } from "./repo";
import { SymbolPicker } from "./SymbolPicker";
import { TypeSwatch } from "./TypeSwatch";

interface CellTypeFormProps {
  /** Edit this custom type; create a new one when omitted. */
  type?: CellType;
  /** Called with the id of the created or edited type. */
  onSaved?: (id: string) => void;
  onClose: () => void;
}

/** Custom cell type form, used in the settings and from the editor palette. */
export function CellTypeForm({ type, onSaved, onClose }: CellTypeFormProps) {
  const create = useCellTypeStore((s) => s.create);
  const update = useCellTypeStore((s) => s.update);
  const [name, setName] = useState(type?.name ?? "");
  const [color, setColor] = useState(type?.color ?? "#8a6fbf");
  const [symbol, setSymbol] = useState<CellSymbol | null>(type?.symbol ?? null);
  const [blocksMove, setBlocksMove] = useState(type?.blocksMove ?? false);
  const [blocksSight, setBlocksSight] = useState(type ? type.blocksSight !== "no" : false);
  const [comment, setComment] = useState(type?.comment ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const input: CustomTypeInput = {
    name,
    color: isHexColor(color) ? color : "#808080",
    symbol,
    blocksMove,
    blocksSight,
    comment,
  };
  const preview: CellType = {
    id: "preview",
    builtin: false,
    name,
    color: input.color,
    pattern: "none",
    symbol,
    blocksMove,
    blocksSight: blocksSight ? "yes" : "no",
    comment,
  };
  const nameError = name.trim() === "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (nameError) return;
    setBusy(true);
    setFailure(null);
    try {
      let id = type?.id;
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
      title={type ? ru.cellTypes.editTitle : ru.cellTypes.newTitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </button>
          <button type="submit" form="cell-type-form" className="primary" disabled={busy}>
            {type ? ru.common.save : ru.common.create}
          </button>
        </>
      }
    >
      <form id="cell-type-form" className="form" onSubmit={submit}>
        <div className="type-form-head">
          <TypeSwatch type={preview} size={48} />
          <label className="field">
            <span>{ru.cellTypes.name}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={60}
            />
            {showErrors && nameError && (
              <small className="error">{ru.cellTypes.nameRequired}</small>
            )}
          </label>
          <label className="field">
            <span>{ru.cellTypes.color}</span>
            <input
              type="color"
              className="color-input"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>
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
        <label className="field">
          <span>{ru.cellTypes.comment}</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={500}
          />
          <small className="hint">{ru.cellTypes.commentHint}</small>
        </label>
        {failure && <p className="error">{failure}</p>}
      </form>
    </Modal>
  );
}
