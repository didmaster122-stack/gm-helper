import { useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { Modal } from "../../shared/ui";
import {
  isValidSize,
  MAX_SIZE,
  MIN_SIZE,
  resizedSize,
  resizeModel,
  type BattlemapModel,
  type ResizeDelta,
} from "./domain/grid";

interface ResizeDialogProps {
  model: BattlemapModel;
  onApply: (next: BattlemapModel) => void;
  onClose: () => void;
}

const SIDES = ["top", "left", "right", "bottom"] as const;

export function ResizeDialog({ model, onApply, onClose }: ResizeDialogProps) {
  const [delta, setDelta] = useState<Record<keyof ResizeDelta, string>>({
    left: "0",
    top: "0",
    right: "0",
    bottom: "0",
  });
  const parsed: ResizeDelta = {
    left: Math.trunc(Number(delta.left)) || 0,
    top: Math.trunc(Number(delta.top)) || 0,
    right: Math.trunc(Number(delta.right)) || 0,
    bottom: Math.trunc(Number(delta.bottom)) || 0,
  };
  const size = resizedSize(model, parsed);
  const valid = isValidSize(size.width) && isValidSize(size.height);
  const crops = Object.values(parsed).some((v) => v < 0);
  const changed = Object.values(parsed).some((v) => v !== 0);

  function apply() {
    if (!valid || !changed) return;
    onApply(resizeModel(model, parsed));
    onClose();
  }

  return (
    <Modal
      title={ru.battlemap.resizeTitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            {ru.common.cancel}
          </button>
          <button type="button" className="primary" onClick={apply} disabled={!valid || !changed}>
            {ru.battlemap.apply}
          </button>
        </>
      }
    >
      <div className="form">
        <p className="hint">{ru.battlemap.resizeHint}</p>
        <div className="resize-grid">
          {SIDES.map((side) => (
            <label key={side} className={`field resize-${side}`}>
              <span>{ru.battlemap[side]}</span>
              <input
                type="number"
                value={delta[side]}
                onChange={(e) => setDelta({ ...delta, [side]: e.target.value })}
              />
            </label>
          ))}
          <div className="resize-center">{ru.battlemap.sizeCells(model.width, model.height)}</div>
        </div>
        <p className={valid ? undefined : "error"}>
          {valid
            ? ru.battlemap.resultSize(size.width, size.height)
            : ru.battlemap.sizeError(MIN_SIZE, MAX_SIZE)}
        </p>
        {crops && valid && <p className="warning">{ru.battlemap.cropWarning}</p>}
      </div>
    </Modal>
  );
}
