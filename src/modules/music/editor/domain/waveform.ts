// Waveform peaks: computed once per decoded source, then aggregated per pixel column.

export interface Peaks {
  /** Buckets per second. */
  rate: number;
  min: Float32Array;
  max: Float32Array;
}

export const PEAKS_PER_SECOND = 200;

/** Minimum and maximum sample of all channels in each bucket. */
export function computePeaks(
  channels: readonly Float32Array[],
  sampleRate: number,
  rate = PEAKS_PER_SECOND,
): Peaks {
  const samples = channels.reduce((n, c) => Math.max(n, c.length), 0);
  const perBucket = sampleRate / rate;
  const buckets = Math.ceil(samples / perBucket);
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * perBucket);
    const to = Math.min(samples, Math.floor((b + 1) * perBucket));
    let lo = 0;
    let hi = 0;
    for (const channel of channels) {
      const end = Math.min(to, channel.length);
      for (let i = from; i < end; i++) {
        const v = channel[i] ?? 0;
        if (v < lo) lo = v;
        else if (v > hi) hi = v;
      }
    }
    min[b] = lo;
    max[b] = hi;
  }
  return { rate, min, max };
}

/** Peak range of the audio between two times (seconds); [0, 0] outside the data. */
export function peakRange(peaks: Peaks, from: number, to: number): [number, number] {
  const count = peaks.min.length;
  let first = Math.floor(from * peaks.rate);
  // A range narrower than a bucket still shows the bucket it falls into.
  let last = Math.max(first + 1, Math.ceil(to * peaks.rate));
  first = Math.max(0, first);
  last = Math.min(count, last);
  let lo = 0;
  let hi = 0;
  for (let i = first; i < last; i++) {
    lo = Math.min(lo, peaks.min[i] ?? 0);
    hi = Math.max(hi, peaks.max[i] ?? 0);
  }
  return [lo, hi];
}
