import { useEffect, useMemo, useRef, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { Button, Modal } from "../../shared/ui";
import { frameRing, type TokenFrame } from "./domain/tokenFrame";
import { artName } from "./domain/paths";
import type { CropMethod } from "./domain/autoCrop";
import type { TokenCrop } from "./domain/tokenCrop";
import type { Art } from "./domain/types";
import {
  frameArt,
  PREVIEW_SIZE,
  reframeArt,
  writeTokens,
  type BatchResult,
  type Framing,
} from "./batchTokens";
import { useLibraryStore } from "./store";
import { loadTokenDefaults, saveTokenDefaults, type TokenDefaults } from "./tokenDefaults";
import { TokenEditor } from "./TokenEditor";
import { TokenOptionsFields } from "./TokenOptionsFields";

/** Tile preview diameter in CSS pixels. */
const TILE = 96;

type Item = { status: "ready"; framing: Framing; checked: boolean } | { status: "error" };

type Phase =
  | { kind: "review" }
  | { kind: "writing"; done: number; total: number }
  | { kind: "done"; result: BatchResult; faces: number };

interface BatchTokensDialogProps {
  root: string;
  system: string;
  group: string;
  onClose: () => void;
}

export function BatchTokensDialog({ root, system, group, onClose }: BatchTokensDialogProps) {
  const arts = useLibraryStore((s) => s.arts);
  const putTokens = useLibraryStore((s) => s.putTokens);
  // Arts that had tokens when the dialog opened; new tokens do not change the list.
  const [hadTokens] = useState(() => new Set(useLibraryStore.getState().tokensByArt.keys()));
  const [includeWithTokens, setIncludeWithTokens] = useState(false);
  const [options, setOptions] = useState<TokenDefaults>(loadTokenDefaults);
  const [items, setItems] = useState<ReadonlyMap<string, Item>>(new Map());
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const [editing, setEditing] = useState<Art | null>(null);
  const cancelled = useRef(false);

  const list = useMemo(
    () =>
      arts
        .filter(
          (a) =>
            !a.missing &&
            !a.unsorted &&
            a.system === system &&
            a.group === group &&
            (includeWithTokens || !hadTokens.has(a.id)),
        )
        .sort((a, b) => artName(a).localeCompare(artName(b), "ru")),
    [arts, system, group, includeWithTokens, hadTokens],
  );

  // Arts are framed one at a time, in the background, as they appear in the list.
  const queued = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const todo = list.filter((a) => !queued.current.has(a.id));
    for (const a of todo) queued.current.add(a.id);
    void (async () => {
      for (const art of todo) {
        if (!mounted.current) return;
        let item: Item;
        try {
          item = { status: "ready", framing: await frameArt(root, art), checked: true };
        } catch (error) {
          console.error("Art could not be framed", art.relPath, error);
          item = { status: "error" };
        }
        if (!mounted.current) {
          if (item.status === "ready") item.framing.preview.close();
          return;
        }
        setItems((m) => new Map(m).set(art.id, item));
      }
    })();
  }, [list, root]);

  // Previews are GPU-backed bitmaps: free them with the dialog.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => {
      mounted.current = false;
      for (const item of itemsRef.current.values()) {
        if (item.status === "ready") item.framing.preview.close();
      }
    },
    [],
  );

  const analyzed = list.filter((a) => items.has(a.id)).length;
  const analyzing = analyzed < list.length;
  const jobs = list.flatMap((art) => {
    const item = items.get(art.id);
    return item?.status === "ready" && item.checked ? [{ art, crop: item.framing.crop }] : [];
  });
  const writing = phase.kind === "writing";

  function update(artId: string, change: (item: Item & { status: "ready" }) => Item) {
    setItems((m) => {
      const item = m.get(artId);
      if (item?.status !== "ready") return m;
      return new Map(m).set(artId, change(item));
    });
  }

  function checkAll(checked: boolean) {
    setItems((m) => {
      const next = new Map(m);
      for (const art of list) {
        const item = next.get(art.id);
        if (item?.status === "ready") next.set(art.id, { ...item, checked });
      }
      return next;
    });
  }

  async function applyCrop(art: Art, crop: TokenCrop) {
    try {
      const preview = await reframeArt(root, art, crop);
      update(art.id, (item) => {
        item.framing.preview.close();
        return {
          ...item,
          checked: true,
          framing: { ...item.framing, crop, method: "manual", preview },
        };
      });
    } catch (error) {
      console.error("Preview was not updated", art.relPath, error);
    }
  }

  async function write() {
    const faces = jobs.filter((j) => {
      const item = items.get(j.art.id);
      return item?.status === "ready" && item.framing.method === "face";
    });
    const faceIds = new Set(faces.map((j) => j.art.id));
    cancelled.current = false;
    saveTokenDefaults(options);
    setPhase({ kind: "writing", done: 0, total: jobs.length });
    const result = await writeTokens(root, jobs, options, {
      isCancelled: () => cancelled.current,
      onProgress: (done) => setPhase({ kind: "writing", done, total: jobs.length }),
      onToken: (token) => putTokens([token]),
    });
    const unreadable = list.filter((a) => items.get(a.id)?.status === "error");
    setPhase({
      kind: "done",
      result: { ...result, failed: [...unreadable, ...result.failed] },
      faces: result.created.filter((t) => faceIds.has(t.artId)).length,
    });
  }

  const title = ru.library.batch.title(group);

  if (phase.kind === "done") {
    const { result, faces } = phase;
    return (
      <Modal
        title={title}
        onClose={onClose}
        footer={
          <Button variant="primary" onClick={onClose}>
            {ru.common.close}
          </Button>
        }
      >
        <p>{ru.library.batch.summary(result.created.length, faces)}</p>
        {result.cancelled && <p className="muted">{ru.library.batch.cancelled}</p>}
        {result.failed.length > 0 && (
          <>
            <p className="error">{ru.library.batch.failedTitle}</p>
            <ul className="batch-failed">
              {result.failed.map((a) => (
                <li key={a.id}>{a.relPath}</li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      wide
      title={title}
      onClose={writing ? () => (cancelled.current = true) : onClose}
      footer={
        writing ? (
          <>
            <progress className="batch-progress" value={phase.done} max={phase.total} />
            <span className="muted">{ru.library.batch.writing(phase.done, phase.total)}</span>
            <Button onClick={() => (cancelled.current = true)}>
              {ru.library.batch.cancelWrite}
            </Button>
          </>
        ) : (
          <>
            {analyzing && (
              <>
                <progress className="batch-progress" value={analyzed} max={list.length} />
                <span className="muted">{ru.library.batch.analyzing(analyzed, list.length)}</span>
              </>
            )}
            <span className="spacer" />
            <Button onClick={onClose}>{ru.common.cancel}</Button>
            <Button
              variant="primary"
              onClick={() => void write()}
              disabled={analyzing || jobs.length === 0}
            >
              {ru.library.batch.create(jobs.length)}
            </Button>
          </>
        )
      }
    >
      <div className="batch-settings">
        <TokenOptionsFields value={options} onChange={setOptions} />
        <div className="batch-toolbar">
          <label className="checkbox" title={ru.library.batch.includeHint}>
            <input
              type="checkbox"
              checked={includeWithTokens}
              disabled={writing}
              onChange={(e) => setIncludeWithTokens(e.target.checked)}
            />
            {ru.library.batch.includeWithTokens}
          </label>
          <span className="spacer" />
          <Button size="sm" variant="ghost" onClick={() => checkAll(true)} disabled={writing}>
            {ru.library.batch.selectAll}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => checkAll(false)} disabled={writing}>
            {ru.library.batch.selectNone}
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="muted">{ru.library.batch.none}</p>
      ) : (
        <div className="batch-grid">
          {list.map((art) => (
            <BatchTile
              key={art.id}
              art={art}
              item={items.get(art.id)}
              frame={options.frame}
              disabled={writing}
              onToggle={(checked) => update(art.id, (item) => ({ ...item, checked }))}
              onEdit={() => setEditing(art)}
            />
          ))}
        </div>
      )}

      {editing &&
        (() => {
          const item = items.get(editing.id);
          if (item?.status !== "ready") return null;
          return (
            <TokenEditor
              root={root}
              art={editing}
              title={ru.library.batch.edit(artName(editing))}
              adjust={{
                crop: item.framing.crop,
                options,
                onApply: (crop) => void applyCrop(editing, crop),
              }}
              onClose={() => setEditing(null)}
            />
          );
        })()}
    </Modal>
  );
}

const METHOD_LABEL: Record<CropMethod, string> = {
  face: ru.library.batch.byFace,
  rule: ru.library.batch.byRule,
  manual: ru.library.batch.manual,
};

function BatchTile({
  art,
  item,
  frame,
  disabled,
  onToggle,
  onEdit,
}: {
  art: Art;
  item: Item | undefined;
  frame: TokenFrame;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preview = item?.status === "ready" ? item.framing.preview : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && preview) drawTile(canvas, preview, frame);
  }, [preview, frame]);

  const name = artName(art);
  const ready = item?.status === "ready";
  return (
    <div className={`batch-tile ${ready && !item.checked ? "unchecked" : ""}`}>
      <button
        type="button"
        className="batch-preview"
        onClick={onEdit}
        disabled={!ready || disabled}
        title={ru.library.batch.edit(name)}
        aria-label={ru.library.batch.edit(name)}
      >
        {preview ? (
          <canvas ref={canvasRef} style={{ width: TILE, height: TILE }} />
        ) : (
          <span className="batch-placeholder" style={{ width: TILE, height: TILE }} />
        )}
      </button>
      <label className="checkbox batch-name" title={name}>
        <input
          type="checkbox"
          checked={ready && item.checked}
          disabled={!ready || disabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>{name}</span>
      </label>
      {item && (
        <span className={`batch-method ${item.status === "ready" ? item.framing.method : "error"}`}>
          {item.status === "ready"
            ? METHOD_LABEL[item.framing.method]
            : ru.library.batch.unreadable}
        </span>
      )}
    </div>
  );
}

/** The framed square clipped to the circle, with the batch frame on top. */
function drawTile(canvas: HTMLCanvasElement, preview: ImageBitmap, frame: TokenFrame) {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.round(TILE * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, TILE, TILE);
  const c = TILE / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(preview, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE, 0, 0, TILE, TILE);
  ctx.restore();
  const ring = frameRing(frame, TILE);
  if (!ring) return;
  ctx.beginPath();
  ctx.arc(c, c, ring.outer, 0, Math.PI * 2);
  ctx.arc(c, c, ring.inner, 0, Math.PI * 2, true);
  ctx.fillStyle = frame.color;
  ctx.fill();
}
