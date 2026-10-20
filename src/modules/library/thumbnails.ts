// Thumbnails are cached in the app cache dir, keyed by content hash, so renames
// and moves reuse them. They are generated lazily when a tile becomes visible.
import { useEffect, useState } from "react";
import { cacheDir, fileUrl, listNames, writeCacheFile } from "../../shared/fs";

const SIZE = 256;
const CONCURRENCY = 3;

let dirPromise: Promise<{ dir: string; known: Set<string> }> | null = null;

function cache() {
  dirPromise ??= cacheDir("thumbs").then(async (dir) => ({
    dir,
    known: new Set(await listNames(dir)),
  }));
  return dirPromise;
}

const inFlight = new Map<string, Promise<string>>();
const queue: (() => void)[] = [];
let running = 0;

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      task()
        .then(resolve, reject)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < CONCURRENCY) run();
    else queue.push(run);
  });
}

async function render(sourcePath: string): Promise<Uint8Array> {
  const img = new Image();
  // Without CORS the canvas is tainted and cannot be exported (the asset protocol sends the headers).
  img.crossOrigin = "anonymous";
  img.src = fileUrl(sourcePath);
  await img.decode();
  const scale = Math.min(1, SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const bitmap = await createImageBitmap(img, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Absolute path of the cached thumbnail, generating it if needed. */
export async function ensureThumbnail(sourcePath: string, hash: string): Promise<string> {
  const { dir, known } = await cache();
  const name = `${hash}.webp`;
  const target = `${dir}/${name}`;
  if (known.has(name)) return target;

  let pending = inFlight.get(hash);
  if (!pending) {
    pending = schedule(async () => {
      await writeCacheFile(target, await render(sourcePath));
      known.add(name);
      return target;
    }).finally(() => inFlight.delete(hash));
    inFlight.set(hash, pending);
  }
  return pending;
}

export type ThumbState = { kind: "loading" } | { kind: "ready"; url: string } | { kind: "error" };

export function useThumbnail(sourcePath: string | null, hash: string | null): ThumbState {
  const key = sourcePath && hash ? `${hash}|${sourcePath}` : null;
  const [state, setState] = useState<{ key: string | null; value: ThumbState }>({
    key: null,
    value: { kind: "loading" },
  });

  useEffect(() => {
    if (!sourcePath || !hash) return;
    let cancelled = false;
    ensureThumbnail(sourcePath, hash).then(
      (path) => !cancelled && setState({ key, value: { kind: "ready", url: fileUrl(path) } }),
      () => !cancelled && setState({ key, value: { kind: "error" } }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, sourcePath, hash]);

  if (!key) return { kind: "error" };
  return state.key === key ? state.value : { kind: "loading" };
}
