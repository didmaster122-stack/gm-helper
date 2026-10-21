import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ru } from "../../shared/i18n/ru";
import { Button, Modal } from "../../shared/ui";
import { toAbsolute } from "./domain/paths";
import {
  clampCrop,
  DEFAULT_CROP,
  imagePlacement,
  panCrop,
  sliderToZoom,
  zoomCropAt,
  zoomToSlider,
  type ImageSize,
  type TokenCrop,
} from "./domain/tokenCrop";
import { frameRing, type TokenFrame } from "./domain/tokenFrame";
import type { Art, Token } from "./domain/types";
import { loadTokenDefaults, saveTokenDefaults, type TokenDefaults } from "./tokenDefaults";
import { createToken, loadImage, updateToken } from "./tokenService";
import { TokenOptionsFields } from "./TokenOptionsFields";

/** Canvas side and circle diameter in CSS pixels; the margin shows the art around the circle. */
const VIEW = 420;
const DIAMETER = 340;
const MARGIN = (VIEW - DIAMETER) / 2;
const WHEEL_STEP = 1.15;
const SLIDER_STEPS = 1000;

interface TokenEditorProps {
  root: string;
  art: Art;
  /** Existing token to adjust; a new one is created otherwise. */
  token?: Token;
  /**
   * Batch creation: only the framing is edited, with the batch's options, and handed
   * back to the caller; nothing is written.
   */
  adjust?: { crop: TokenCrop; options: TokenDefaults; onApply: (crop: TokenCrop) => void };
  title: string;
  onSaved?: (token: Token) => void;
  onClose: () => void;
}

type Loaded = { kind: "loading" } | { kind: "error" } | { kind: "ready"; img: HTMLImageElement };

export function TokenEditor({
  root,
  art,
  token,
  adjust,
  title,
  onSaved,
  onClose,
}: TokenEditorProps) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [crop, setCrop] = useState<TokenCrop>(adjust?.crop ?? token?.crop ?? DEFAULT_CROP);
  const [options, setOptions] = useState<TokenDefaults>(() => {
    if (adjust) return adjust.options;
    return token
      ? { size: token.size, cells: token.cells, frame: token.frame }
      : loadTokenDefaults();
  });
  const { frame } = options;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const path = toAbsolute(root, art.relPath);
  useEffect(() => {
    let cancelled = false;
    loadImage(path).then(
      (img) => {
        if (cancelled) return;
        setCrop((c) => clampCrop(c, imageSize(img)));
        setLoaded({ kind: "ready", img });
      },
      () => !cancelled && setLoaded({ kind: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  const img = loaded.kind === "ready" ? loaded.img : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && img) draw(canvas, img, crop, frame);
  }, [img, crop, frame]);

  // React registers wheel listeners as passive, so preventDefault needs a native one.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left - VIEW / 2;
      const py = e.clientY - rect.top - VIEW / 2;
      const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
      setCrop((c) => zoomCropAt(c, c.zoom * factor, px, py, DIAMETER, imageSize(img)));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [img]);

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const start = drag.current;
    if (!start || !img) return;
    drag.current = { x: e.clientX, y: e.clientY };
    setCrop((c) => panCrop(c, e.clientX - start.x, e.clientY - start.y, DIAMETER, imageSize(img)));
  }

  function onPointerUp() {
    drag.current = null;
  }

  async function save() {
    if (!img) return;
    if (adjust) {
      adjust.onApply(crop);
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const params = { ...options, crop };
      const saved = token
        ? await updateToken(root, token, img, params)
        : await createToken(root, art, img, params);
      saveTokenDefaults(options);
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {ru.common.cancel}
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !img}>
            {busy ? ru.library.token.saving : adjust ? ru.library.batch.apply : ru.common.save}
          </Button>
        </>
      }
    >
      <div className="token-editor">
        {loaded.kind === "error" ? (
          <p className="error">{ru.library.token.loadError}</p>
        ) : (
          <canvas
            ref={canvasRef}
            className="token-canvas"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}
        <p className="hint">{ru.library.token.hint}</p>
        <div className="token-controls">
          <label className="field">
            <span>{ru.library.token.zoom}</span>
            <input
              type="range"
              min={0}
              max={SLIDER_STEPS}
              disabled={!img}
              value={img ? Math.round(zoomToSlider(crop.zoom, imageSize(img)) * SLIDER_STEPS) : 0}
              onChange={(e) => {
                if (!img) return;
                const zoom = sliderToZoom(Number(e.target.value) / SLIDER_STEPS, imageSize(img));
                setCrop((c) => zoomCropAt(c, zoom, 0, 0, DIAMETER, imageSize(img)));
              }}
            />
          </label>
          <Button
            onClick={() => img && setCrop(clampCrop(DEFAULT_CROP, imageSize(img)))}
            disabled={!img}
          >
            {ru.library.token.reset}
          </Button>
        </div>
        {adjust ? null : <TokenOptionsFields value={options} onChange={setOptions} />}
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}

function imageSize(img: HTMLImageElement): ImageSize {
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/** The art around the circle is dimmed so it is clear what ends up in the token. */
function draw(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  crop: TokenCrop,
  frame: TokenFrame,
) {
  const dpr = window.devicePixelRatio || 1;
  const px = Math.round(VIEW * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, VIEW, VIEW);
  ctx.imageSmoothingQuality = "high";

  const place = imagePlacement(crop, imageSize(img), DIAMETER);
  ctx.drawImage(img, MARGIN + place.x, MARGIN + place.y, place.width, place.height);

  const c = VIEW / 2;
  ctx.beginPath();
  ctx.rect(0, 0, VIEW, VIEW);
  ctx.arc(c, c, DIAMETER / 2, 0, Math.PI * 2, true);
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fill("evenodd");

  const ring = frameRing(frame, DIAMETER);
  if (ring) {
    ctx.beginPath();
    ctx.arc(c, c, ring.outer, 0, Math.PI * 2);
    ctx.arc(c, c, ring.inner, 0, Math.PI * 2, true);
    ctx.fillStyle = frame.color;
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.arc(c, c, DIAMETER / 2, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.stroke();
}
