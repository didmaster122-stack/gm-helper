// Web Audio side of the editor: decoded sources and live playback of the mix.
// Like the catalog player, it lives outside React; the store drives it.
import { fileUrl } from "../../../shared/fs";
import { LANE_COUNT, laneGain, type Project } from "./domain/project";
import { scheduleFrom } from "./domain/schedule";
import { computePeaks, type Peaks } from "./domain/waveform";

export interface DecodedSource {
  buffer: AudioBuffer;
  peaks: Peaks;
}

let context: AudioContext | null = null;

function audioContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

// ---- Sources ----

/** Decoded audio by source id. Kept while any undo step still refers to the source. */
const decoded = new Map<string, DecodedSource>();

export const getDecoded = (sourceId: string): DecodedSource | undefined => decoded.get(sourceId);

/** Reads and decodes a whole file; the peaks for its waveform come along. */
export async function decodeFile(absPath: string): Promise<DecodedSource> {
  const response = await fetch(fileUrl(absPath));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const buffer = await audioContext().decodeAudioData(await response.arrayBuffer());
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  return { buffer, peaks: computePeaks(channels, buffer.sampleRate) };
}

export function keepDecoded(sourceId: string, source: DecodedSource): void {
  decoded.set(sourceId, source);
}

/** Frees the audio of sources no project state refers to any more. */
export function pruneDecoded(used: ReadonlySet<string>): void {
  for (const id of decoded.keys()) if (!used.has(id)) decoded.delete(id);
}

// ---- Playback ----

interface Session {
  nodes: AudioBufferSourceNode[];
  /** Context time of position `from`. */
  startedAt: number;
  from: number;
}

const START_DELAY_S = 0.03;
let lanes: GainNode[] | null = null;
let session: Session | null = null;

function laneNodes(ctx: AudioContext): GainNode[] {
  lanes ??= Array.from({ length: LANE_COUNT }, () => {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    return gain;
  });
  return lanes;
}

export function setLaneGains(project: Project): void {
  if (!lanes || !context) return;
  const now = context.currentTime;
  lanes.forEach((gain, i) => gain.gain.setTargetAtTime(laneGain(project.lanes[i]), now, 0.015));
}

function begin(from: number, schedule: (ctx: AudioContext, at: number) => AudioBufferSourceNode[]) {
  stopPlayback();
  const ctx = audioContext();
  void ctx.resume();
  const at = ctx.currentTime + START_DELAY_S;
  session = { nodes: schedule(ctx, at), startedAt: at, from };
}

/** Plays the mix from `from` seconds. */
export function playMix(project: Project, from: number): void {
  begin(from, (ctx, at) => {
    const gains = laneNodes(ctx);
    setLaneGains(project);
    return scheduleFrom(project, from).flatMap((item) => {
      const buffer = decoded.get(item.sourceId)?.buffer;
      const gain = gains[item.lane];
      if (!buffer || !gain || item.duration <= 0) return [];
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      node.start(at + item.when, item.offset, item.duration);
      return [node];
    });
  });
}

/** Plays a fragment of one source, bypassing the lanes. */
export function playSource(sourceId: string, from: number, to: number): void {
  begin(from, (ctx, at) => {
    const buffer = decoded.get(sourceId)?.buffer;
    if (!buffer || to <= from) return [];
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    node.start(at, from, to - from);
    return [node];
  });
}

/** Seconds into whatever is playing, or null when stopped. */
export function playbackPosition(): number | null {
  if (!session || !context) return null;
  return session.from + Math.max(0, context.currentTime - session.startedAt);
}

export function stopPlayback(): void {
  if (!session) return;
  for (const node of session.nodes) {
    try {
      node.stop();
    } catch {
      // Not started yet in some engines; disconnecting is enough.
    }
    node.disconnect();
  }
  session = null;
}
