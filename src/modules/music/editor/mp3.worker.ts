// Encodes PCM to MP3 off the main thread (LAME compiled to WebAssembly).
import { createMp3Encoder } from "wasm-media-encoders";

export interface EncodeRequest {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

export type EncodeMessage =
  | { type: "progress"; done: number }
  | { type: "done"; data: Uint8Array }
  | { type: "error"; message: string };

/** The parts of the worker scope used here (the DOM lib does not describe workers). */
interface WorkerScope {
  onmessage: ((event: MessageEvent<EncodeRequest>) => void) | null;
  postMessage(message: EncodeMessage, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
/** Samples per encode call: a whole number of MP3 frames (1152 samples). */
const CHUNK = 1152 * 256;
const BITRATE = 192;

scope.onmessage = (event) => {
  void encode(event.data).catch((error: unknown) =>
    scope.postMessage({ type: "error", message: String(error) }),
  );
};

async function encode({ left, right, sampleRate }: EncodeRequest) {
  const encoder = await createMp3Encoder();
  encoder.configure({ channels: 2, sampleRate, bitrate: BITRATE });
  const parts: Uint8Array[] = [];
  let size = 0;
  // The encoder reuses its output buffer, so every chunk is copied.
  const keep = (chunk: Uint8Array) => {
    parts.push(chunk.slice());
    size += chunk.length;
  };
  for (let i = 0; i < left.length; i += CHUNK) {
    keep(encoder.encode([left.subarray(i, i + CHUNK), right.subarray(i, i + CHUNK)]));
    scope.postMessage({ type: "progress", done: Math.min(1, (i + CHUNK) / left.length) });
  }
  keep(encoder.finalize());

  const data = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }
  scope.postMessage({ type: "done", data }, [data.buffer]);
}
