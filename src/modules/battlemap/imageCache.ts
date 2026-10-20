// Decoded custom pictures (data URLs) for synchronous Canvas drawing. Stores load the
// pictures of cell types and objects before publishing them, so render code can
// rely on getImage() returning a ready image.

const images = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

/** The decoded picture, or null if it was not loaded (or failed to load). */
export function getImage(url: string): HTMLImageElement | null {
  return images.get(url) ?? null;
}

function load(url: string): Promise<void> {
  let p = pending.get(url);
  if (!p) {
    const img = new Image();
    img.src = url;
    p = img.decode().then(
      () => {
        images.set(url, img);
      },
      (error: unknown) => console.error("Cannot decode custom picture", error),
    );
    pending.set(url, p);
  }
  return p;
}

export async function loadImages(urls: Iterable<string>): Promise<void> {
  await Promise.all([...new Set(urls)].filter((u) => u !== "").map(load));
}
