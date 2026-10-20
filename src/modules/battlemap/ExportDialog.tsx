import { useMemo, useState } from "react";
import { pickSavePath, writeChosenFile } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { Modal } from "../../shared/ui";
import { makeTypeLookup, type CellType } from "./domain/cellTypes";
import {
  DEFAULT_EXPORT_CELL,
  EXPORT_CELL_SIZES,
  fitsCanvas,
  gmmapFileName,
  legendEntries,
  legendFileName,
  pngFileName,
  type LegendMode,
} from "./domain/exportLayout";
import { toGmmapFile } from "./domain/gmmapFile";
import type { BattlemapModel } from "./domain/grid";
import {
  canvasToPng,
  layoutLegend,
  mapImageSize,
  renderLegendImage,
  renderMapImage,
  type ExportOptions,
} from "./exportRender";

interface ExportDialogProps {
  name: string;
  description: string;
  model: BattlemapModel;
  types: CellType[];
  onClose: () => void;
}

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "done" | "error"; text: string };

const LEGEND_MODES: { id: LegendMode; label: string }[] = [
  { id: "none", label: ru.battlemap.export.legendNone },
  { id: "strip", label: ru.battlemap.export.legendStrip },
  { id: "separate", label: ru.battlemap.export.legendSeparate },
];

const PNG_FILTER = [{ name: ru.battlemap.export.pngFilter, extensions: ["png"] }];

export function ExportDialog({ name, description, model, types, onClose }: ExportDialogProps) {
  const t = ru.battlemap.export;
  const [options, setOptions] = useState<ExportOptions>({
    cellPx: DEFAULT_EXPORT_CELL,
    grid: true,
    outlines: true,
    labels: true,
    legend: "none",
  });
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const typeOf = useMemo(() => makeTypeLookup(types), [types]);
  const entries = useMemo(() => legendEntries(model, types, typeOf), [model, types, typeOf]);
  const legend = useMemo(
    () => (options.legend === "none" ? null : layoutLegend(entries, name, options.cellPx)),
    [entries, name, options.legend, options.cellPx],
  );
  const size = mapImageSize(model, options, legend);
  const widthPx = size.widthCells * options.cellPx;
  const heightPx = size.heightCells * options.cellPx;
  const fits = fitsCanvas(widthPx, heightPx);
  const busy = status.kind === "busy";

  const set = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  async function run(task: () => Promise<string[]>) {
    setStatus({ kind: "busy" });
    try {
      const saved = await task();
      setStatus(
        saved.length > 0 ? { kind: "done", text: t.saved(saved.join(", ")) } : { kind: "idle" },
      );
    } catch (error) {
      console.error(error);
      setStatus({ kind: "error", text: t.failed(String(error)) });
    }
  }

  const savePng = () =>
    run(async () => {
      const fileName = pngFileName(name, size.widthCells, size.heightCells, options.cellPx);
      const path = await pickSavePath(t.savePngTitle, fileName, PNG_FILTER);
      if (!path) return [];
      // Let React paint the "saving" state before the heavy synchronous render.
      await new Promise((r) => setTimeout(r, 0));
      await writeChosenFile(
        path,
        await canvasToPng(renderMapImage(model, typeOf, options, legend)),
      );
      const saved = [path];
      if (options.legend === "separate" && legend) {
        const legendPath = await pickSavePath(
          t.saveLegendTitle,
          legendFileName(name, t.legendSuffix),
          PNG_FILTER,
        );
        if (legendPath) {
          await writeChosenFile(legendPath, await canvasToPng(renderLegendImage(legend)));
          saved.push(legendPath);
        }
      }
      return saved;
    });

  const saveFile = () =>
    run(async () => {
      const path = await pickSavePath(t.saveFileTitle, gmmapFileName(name), [
        { name: t.gmmapFilter, extensions: ["json"] },
      ]);
      if (!path) return [];
      const json = JSON.stringify(toGmmapFile({ name, description }, model, types));
      await writeChosenFile(path, new TextEncoder().encode(json));
      return [path];
    });

  return (
    <Modal
      title={t.title}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} disabled={busy}>
          {ru.common.close}
        </button>
      }
    >
      <div className="form export-dialog">
        <h3 className="subheading">{t.png}</h3>
        <label className="field">
          <span>{t.cellSize}</span>
          <select
            value={options.cellPx}
            onChange={(e) =>
              set(
                "cellPx",
                EXPORT_CELL_SIZES.find((px) => px === Number(e.target.value)) ??
                  DEFAULT_EXPORT_CELL,
              )
            }
          >
            {EXPORT_CELL_SIZES.map((px) => (
              <option key={px} value={px}>
                {t.cellOption(px)}
              </option>
            ))}
          </select>
        </label>
        <div className="checkbox-row">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={options.grid}
              onChange={(e) => set("grid", e.target.checked)}
            />
            {t.grid}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={options.outlines}
              onChange={(e) => set("outlines", e.target.checked)}
            />
            {t.outlines}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={options.labels}
              onChange={(e) => set("labels", e.target.checked)}
            />
            {t.labels}
          </label>
        </div>
        <fieldset className="field radio-group">
          <span>{t.legend}</span>
          {LEGEND_MODES.map((m) => (
            <label key={m.id}>
              <input
                type="radio"
                checked={options.legend === m.id}
                onChange={() => set("legend", m.id)}
              />
              {m.label}
            </label>
          ))}
        </fieldset>
        <p className="hint">
          {t.result(size.widthCells, size.heightCells, widthPx, heightPx)}
          <br />
          {t.vttHint(size.widthCells, size.heightCells)}
        </p>
        {!fits && <p className="error">{t.tooBig}</p>}
        <button
          type="button"
          className="primary"
          onClick={() => void savePng()}
          disabled={busy || !fits}
        >
          {busy ? t.rendering : t.savePng}
        </button>

        <h3 className="subheading">{t.file}</h3>
        <p className="hint">{t.fileHint}</p>
        <button type="button" onClick={() => void saveFile()} disabled={busy}>
          {t.saveFile}
        </button>

        {status.kind === "done" && <p className="notice-text">{status.text}</p>}
        {status.kind === "error" && <p className="error">{status.text}</p>}
      </div>
    </Modal>
  );
}
