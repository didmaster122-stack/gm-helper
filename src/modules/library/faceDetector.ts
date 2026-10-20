// Offline face detection for batch tokens: SSD MobileNet v1 from face-api.
// The model ships with the app (bundled from the npm package) and nothing goes to the network.
import * as faceapi from "@vladmandic/face-api";
import manifestUrl from "@vladmandic/face-api/model/ssd_mobilenetv1_model-weights_manifest.json?url";
import weightsUrl from "@vladmandic/face-api/model/ssd_mobilenetv1_model.bin?url";
import { regionToImage, scaledSize, searchRegions, type FaceBox } from "./domain/autoCrop";
import type { ImageSize } from "./domain/tokenCrop";

/** Long side of the picture handed to the detector (its own input is 512 × 512). */
const DETECT_SIZE = 512;
const MIN_CONFIDENCE = 0.5;
const MAX_FACES = 10;

type ManifestEntries = Parameters<typeof faceapi.tf.io.decodeWeights>[1];

let loading: Promise<boolean> | null = null;

/** Loads the model once; false when it cannot run here (then framing falls back to the rule). */
function ready(): Promise<boolean> {
  loading ??= (async () => {
    try {
      const manifest = (await (await fetch(manifestUrl)).json()) as { weights: ManifestEntries }[];
      const data = await (await fetch(weightsUrl)).arrayBuffer();
      const weights = faceapi.tf.io.decodeWeights(
        data,
        manifest.flatMap((group) => group.weights),
      );
      faceapi.nets.ssdMobilenetv1.loadFromWeightMap(weights);
      return true;
    } catch (error) {
      console.error("Face detector is not available", error);
      return false;
    }
  })();
  return loading;
}

async function detect(bitmap: ImageBitmap): Promise<FaceBox[]> {
  const input = faceapi.tf.browser.fromPixels(bitmap);
  try {
    const found = await faceapi.detectAllFaces(
      input,
      new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_CONFIDENCE, maxResults: MAX_FACES }),
    );
    return found.map((d) => ({
      x: d.box.x,
      y: d.box.y,
      width: d.box.width,
      height: d.box.height,
      score: d.score,
    }));
  } finally {
    input.dispose();
  }
}

/**
 * Faces on the art in its own pixels; the art is searched in parts until one is found.
 * Null when the detector is not available.
 */
export async function findFaces(
  img: HTMLImageElement,
  image: ImageSize,
): Promise<FaceBox[] | null> {
  if (!(await ready())) return null;
  for (const region of searchRegions(image)) {
    const scaled = scaledSize(region, DETECT_SIZE);
    const bitmap = await createImageBitmap(
      img,
      Math.round(region.x),
      Math.round(region.y),
      Math.round(region.width),
      Math.round(region.height),
      { resizeWidth: scaled.width, resizeHeight: scaled.height, resizeQuality: "medium" },
    );
    try {
      const faces = await detect(bitmap);
      if (faces.length > 0) return faces.map((f) => regionToImage(f, region, scaled));
    } finally {
      bitmap.close();
    }
  }
  return [];
}
