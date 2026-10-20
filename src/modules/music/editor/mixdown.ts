// Mixdown for saving: render the project offline, then encode MP3 in a worker.
import { getDecoded } from "./audio";
import { LANE_COUNT, laneGain, projectDuration, type Project } from "./domain/project";
import { scheduleFrom } from "./domain/schedule";
import type { EncodeMessage, EncodeRequest } from "./mp3.worker";

const SAMPLE_RATE = 44100;

/** Renders the whole project to a stereo buffer (faster than real time, off the main thread). */
export async function renderMix(project: Project): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(projectDuration(project) * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const gains = Array.from({ length: LANE_COUNT }, (_, i) => {
    const gain = ctx.createGain();
    gain.gain.value = laneGain(project.lanes[i]);
    gain.connect(ctx.destination);
    return gain;
  });
  for (const item of scheduleFrom(project, 0)) {
    const buffer = getDecoded(item.sourceId)?.buffer;
    const gain = gains[item.lane];
    if (!buffer || !gain || gain.gain.value === 0) continue;
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(gain);
    node.start(item.when, item.offset, item.duration);
  }
  return ctx.startRendering();
}

/** MP3 at 192 kbit/s; `onProgress` gets 0…1. */
export function encodeMp3(
  buffer: AudioBuffer,
  onProgress: (done: number) => void,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./mp3.worker.ts", import.meta.url), { type: "module" });
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<EncodeMessage>) => {
      const message = event.data;
      if (message.type === "progress") onProgress(message.done);
      else if (message.type === "done") {
        finish();
        resolve(message.data);
      } else {
        finish();
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message));
    };
    // Copies: the rendered buffer's own arrays cannot be transferred.
    const left = buffer.getChannelData(0).slice();
    const right = (buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left).slice();
    const request: EncodeRequest = { left, right, sampleRate: buffer.sampleRate };
    worker.postMessage(request, [left.buffer, right.buffer]);
  });
}
