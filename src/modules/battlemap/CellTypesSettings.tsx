import { useEffect, useRef, useState, type FormEvent } from "react";
import { ru } from "../../shared/i18n/ru";
import { ConfirmDialog, Modal } from "../../shared/ui";
import { useCellTypeStore } from "./cellTypeStore";
import {
  BUILTIN_TYPES,
  CELL_ICONS,
  isCellIcon,
  isHexColor,
  type CellIcon,
  type CellType,
} from "./domain/cellTypes";
import type { CustomTypeInput } from "./repo";
import { TypeSwatch } from "./TypeSwatch";

const DEFAULT_COLORS = new Map(BUILTIN_TYPES.map((t) => [t.id, t.color]));

function flagsText(t: CellType): string {
  const c = ru.cellTypes;
  const sight =
    t.blocksSight === "partial" ? c.sightPartial : t.blocksSight === "yes" ? c.yes : c.no;
  return `${c.blocksMove}: ${t.blocksMove ? c.yes : c.no} · ${c.blocksSight}: ${sight}`;
}

/**
 * Colour picker that saves after the user stops dragging instead of on every change.
 * The parent keys it by the saved colour, so an outside change resets it.
 */
function ColorInput({ value, onCommit }: { value: string; onCommit: (color: string) => void }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <input
      type="color"
      className="color-input"
      value={local}
      onChange={(e) => {
        const color = e.target.value;
        setLocal(color);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(color), 300);
      }}
    />
  );
}

/** Settings section: built-in cell types (colour only) and custom types (full CRUD). */
export function CellTypesSettings() {
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
    <>
      <h3 className="subheading">{ru.cellTypes.builtin}</h3>
      <ul className="type-list">
        {builtins.map((t) => {
          const changed = t.color !== DEFAULT_COLORS.get(t.id);
          return (
            <li key={t.id}>
              <TypeSwatch type={t} size={24} />
              <div className="type-info">
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
                  <button type="button" onClick={() => void setBuiltinColor(t.id, null)}>
                    {ru.cellTypes.resetColor}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="tokens-heading subheading">
        <h3>{ru.cellTypes.custom}</h3>
        <button type="button" onClick={() => setEditing("new")}>
          {ru.cellTypes.add}
        </button>
      </div>
      {custom.length === 0 ? (
        <p className="muted">{ru.cellTypes.noCustom}</p>
      ) : (
        <ul className="type-list">
          {custom.map((t) => (
            <li key={t.id}>
              <TypeSwatch type={t} size={24} />
              <div className="type-info">
                <strong>{t.name}</strong>
                <div className="muted">{flagsText(t)}</div>
              </div>
              <div className="row-actions">
                <button type="button" onClick={() => setEditing(t)}>
                  {ru.common.change}
                </button>
                <button type="button" className="danger" onClick={() => setDeleting(t)}>
                  {ru.common.delete}
                </button>
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
    </>
  );
}

type SymbolKind = "none" | "letter" | "icon";

function CellTypeForm({ type, onClose }: { type?: CellType; onClose: () => void }) {
  const create = useCellTypeStore((s) => s.create);
  const update = useCellTypeStore((s) => s.update);
  const [name, setName] = useState(type?.name ?? "");
  const [color, setColor] = useState(type?.color ?? "#8a6fbf");
  const [kind, setKind] = useState<SymbolKind>(type?.symbol?.kind ?? "none");
  const [letter, setLetter] = useState(type?.symbol?.kind === "letter" ? type.symbol.value : "");
  const [icon, setIcon] = useState<CellIcon>(
    type?.symbol?.kind === "icon" ? type.symbol.value : "circle",
  );
  const [blocksMove, setBlocksMove] = useState(type?.blocksMove ?? false);
  const [blocksSight, setBlocksSight] = useState(type ? type.blocksSight !== "no" : false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const firstLetter = [...letter.trim()][0] ?? "";
  const input: CustomTypeInput = {
    name,
    color: isHexColor(color) ? color : "#808080",
    symbol:
      kind === "icon"
        ? { kind: "icon", value: icon }
        : kind === "letter" && firstLetter
          ? { kind: "letter", value: firstLetter }
          : null,
    blocksMove,
    blocksSight,
  };
  const preview: CellType = {
    id: "preview",
    builtin: false,
    name,
    color: input.color,
    pattern: "none",
    symbol: input.symbol,
    blocksMove,
    blocksSight: blocksSight ? "yes" : "no",
  };
  const nameError = name.trim() === "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    if (nameError) return;
    setBusy(true);
    setFailure(null);
    try {
      if (type) await update(type.id, input);
      else await create(input);
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
        <fieldset className="field radio-group">
          <span>{ru.cellTypes.symbol}</span>
          <label>
            <input type="radio" checked={kind === "none"} onChange={() => setKind("none")} />
            {ru.cellTypes.symbolNone}
          </label>
          <label>
            <input type="radio" checked={kind === "letter"} onChange={() => setKind("letter")} />
            {ru.cellTypes.symbolLetter}
            <input
              className="letter-input"
              value={letter}
              maxLength={2}
              onChange={(e) => {
                setLetter(e.target.value);
                setKind("letter");
              }}
            />
          </label>
          <label>
            <input type="radio" checked={kind === "icon"} onChange={() => setKind("icon")} />
            {ru.cellTypes.symbolIcon}
            <select
              value={icon}
              onChange={(e) => {
                if (isCellIcon(e.target.value)) setIcon(e.target.value);
                setKind("icon");
              }}
            >
              {CELL_ICONS.map((i) => (
                <option key={i} value={i}>
                  {ru.cellTypes.icons[i]}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
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
