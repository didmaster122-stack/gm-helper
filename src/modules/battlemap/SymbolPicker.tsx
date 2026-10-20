import { useState } from "react";
import { createPortal } from "react-dom";
import { ru } from "../../shared/i18n/ru";
import { ArtPicker, toAbsolute } from "../library";
import { CELL_ICONS, isCellIcon, type CellIcon, type CellSymbol } from "./domain/cellTypes";
import { useLibraryAccess } from "./libraryContext";
import { pictureFromFile, pictureFromPath } from "./pictureImport";

type SymbolKind = "none" | CellSymbol["kind"];

interface SymbolPickerProps {
  value: CellSymbol | null;
  onChange: (symbol: CellSymbol | null) => void;
}

/** Letter, icon or custom picture (from a file or the art library) of a cell type or object. */
export function SymbolPicker({ value, onChange }: SymbolPickerProps) {
  const library = useLibraryAccess();
  const [kind, setKind] = useState<SymbolKind>(value?.kind ?? "none");
  const [letter, setLetter] = useState(value?.kind === "letter" ? value.value : "");
  const [icon, setIcon] = useState<CellIcon>(value?.kind === "icon" ? value.value : "circle");
  const [image, setImage] = useState(value?.kind === "image" ? value.value : "");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function emit(next: SymbolKind, values: { letter?: string; icon?: CellIcon; image?: string }) {
    setKind(next);
    const l = [...(values.letter ?? letter).trim()][0] ?? "";
    const img = values.image ?? image;
    if (next === "letter") onChange(l ? { kind: "letter", value: l } : null);
    else if (next === "icon") onChange({ kind: "icon", value: values.icon ?? icon });
    else if (next === "image") onChange(img ? { kind: "image", value: img } : null);
    else onChange(null);
  }

  async function load(task: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      const url = await task();
      if (url) {
        setImage(url);
        emit("image", { image: url });
      }
    } catch (e) {
      console.error(e);
      setError(ru.picture.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <fieldset className="field radio-group">
        <span>{ru.cellTypes.symbol}</span>
        <label>
          <input type="radio" checked={kind === "none"} onChange={() => emit("none", {})} />
          {ru.cellTypes.symbolNone}
        </label>
        <label>
          <input type="radio" checked={kind === "letter"} onChange={() => emit("letter", {})} />
          {ru.cellTypes.symbolLetter}
          <input
            className="letter-input"
            value={letter}
            maxLength={2}
            onChange={(e) => {
              setLetter(e.target.value);
              emit("letter", { letter: e.target.value });
            }}
          />
        </label>
        <label>
          <input type="radio" checked={kind === "icon"} onChange={() => emit("icon", {})} />
          {ru.cellTypes.symbolIcon}
          <select
            value={icon}
            onChange={(e) => {
              if (!isCellIcon(e.target.value)) return;
              setIcon(e.target.value);
              emit("icon", { icon: e.target.value });
            }}
          >
            {CELL_ICONS.map((i) => (
              <option key={i} value={i}>
                {ru.cellTypes.icons[i]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="radio" checked={kind === "image"} onChange={() => emit("image", {})} />
          {ru.picture.label}
        </label>
        {kind === "image" && (
          <div className="picture-row">
            {image ? (
              <img className="picture-preview" src={image} alt="" />
            ) : (
              <span className="picture-preview empty">{ru.picture.none}</span>
            )}
            <div className="picture-actions">
              <button type="button" disabled={busy} onClick={() => void load(pictureFromFile)}>
                {ru.picture.fromFile}
              </button>
              <button
                type="button"
                disabled={busy || !library.root}
                title={library.root ? undefined : ru.picture.noLibrary}
                onClick={() => setPicking(true)}
              >
                {ru.picture.fromLibrary}
              </button>
              <small className="hint">{ru.picture.hint}</small>
            </div>
          </div>
        )}
        {error && <small className="error">{error}</small>}
      </fieldset>
      {/* A portal keeps the picker out of the surrounding <form>: Enter in its search must not submit it. */}
      {picking &&
        library.root &&
        createPortal(
          <ArtPicker
            libraryRoot={library.root}
            preferredSystem={library.system}
            onPick={(art) => {
              setPicking(false);
              const root = library.root;
              if (root) void load(() => pictureFromPath(toAbsolute(root, art.relPath)));
            }}
            onClose={() => setPicking(false)}
          />,
          document.body,
        )}
    </>
  );
}
