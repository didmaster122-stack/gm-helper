// Playback engine (spec §6.3). Two <audio> elements ("decks") let the next track fade in
// while the current one fades out. State for the UI lives in usePlayerStore; the engine
// itself stays outside React so music keeps playing on every screen.
import { create } from "zustand";
import {
  clampCrossfade,
  fadeGain,
  makeOrder,
  nextPosition,
  previousPosition,
  reorder,
  RESTART_THRESHOLD_S,
  type Repeat,
} from "./domain/queue";

export interface QueueItem {
  trackId: string;
  title: string;
  url: string;
}

interface Prefs {
  volume: number;
  muted: boolean;
  repeat: Repeat;
  shuffle: boolean;
  crossfade: number;
}

export interface PlayerState extends Prefs {
  items: QueueItem[];
  /** Indexes of `items` in play order. */
  order: number[];
  /** Position in `order`. */
  pos: number;
  current: QueueItem | null;
  playing: boolean;
  /** Seconds into the current track. */
  position: number;
  /** Seconds; 0 while unknown. */
  duration: number;
  error: string | null;

  playList: (items: QueueItem[], start: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setRepeat: (repeat: Repeat) => void;
  setShuffle: (shuffle: boolean) => void;
  setCrossfade: (seconds: number) => void;
  stop: () => void;
}

const PREFS_KEY = "gm-helper.player";
const MANUAL_FADE_S = 0.6;
const TICK_MS = 50;

const defaultPrefs: Prefs = {
  volume: 0.8,
  muted: false,
  repeat: "all",
  shuffle: false,
  crossfade: 3,
};

function loadPrefs(): Prefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return defaultPrefs;
    const p = raw as Partial<Prefs>;
    return {
      volume:
        typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : defaultPrefs.volume,
      muted: p.muted === true,
      repeat: p.repeat === "off" || p.repeat === "one" || p.repeat === "all" ? p.repeat : "all",
      shuffle: p.shuffle === true,
      crossfade: clampCrossfade(typeof p.crossfade === "number" ? p.crossfade : 3),
    };
  } catch {
    return defaultPrefs;
  }
}

function savePrefs(s: Prefs) {
  try {
    const { volume, muted, repeat, shuffle, crossfade } = s;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ volume, muted, repeat, shuffle, crossfade }));
  } catch {
    // Not saved; still applied for this run.
  }
}

// ---- Engine ----

interface Fade {
  from: number;
  to: number;
  start: number;
  duration: number;
  done?: () => void;
}

interface Deck {
  audio: HTMLAudioElement;
  /** Fade multiplier, applied on top of the master volume. */
  gain: number;
  fade: Fade | null;
}

let decks: [Deck, Deck] | null = null;
let active = 0;
let ticker: ReturnType<typeof setInterval> | null = null;
/** An automatic crossfade into the next track has started for the current one. */
let handingOver = false;
/** Consecutive tracks that failed to play; stops a queue of broken files from spinning. */
let failures = 0;

function master(): number {
  const { volume, muted } = usePlayerStore.getState();
  return muted ? 0 : volume;
}

function applyVolume(deck: Deck) {
  deck.audio.volume = Math.min(1, Math.max(0, deck.gain * master()));
}

function tick() {
  if (!decks) return;
  const now = performance.now();
  let fading = false;
  for (const deck of decks) {
    const f = deck.fade;
    if (!f) continue;
    const t = (now - f.start) / 1000;
    deck.gain = fadeGain(f.from, f.to, t, f.duration);
    applyVolume(deck);
    if (t >= f.duration) {
      deck.fade = null;
      f.done?.();
    } else fading = true;
  }
  if (!fading && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function fade(deck: Deck, to: number, seconds: number, done?: () => void) {
  if (seconds <= 0) {
    deck.fade = null;
    deck.gain = to;
    applyVolume(deck);
    done?.();
    return;
  }
  deck.fade = { from: deck.gain, to, start: performance.now(), duration: seconds, done };
  ticker ??= setInterval(tick, TICK_MS);
}

function release(deck: Deck) {
  deck.fade = null;
  deck.audio.pause();
  deck.audio.removeAttribute("src");
  deck.audio.load();
}

function engine(): [Deck, Deck] {
  if (decks) return decks;
  const make = (): Deck => {
    const audio = new Audio();
    audio.preload = "auto";
    const deck: Deck = { audio, gain: 1, fade: null };
    const isActive = () => decks !== null && decks[active] === deck;

    audio.addEventListener("timeupdate", () => {
      if (!isActive()) return;
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      usePlayerStore.setState({ position: audio.currentTime, duration });
      maybeHandOver(audio.currentTime, duration);
    });
    audio.addEventListener("loadedmetadata", () => {
      if (isActive() && Number.isFinite(audio.duration)) {
        usePlayerStore.setState({ duration: audio.duration });
      }
    });
    audio.addEventListener("playing", () => {
      if (!isActive()) return;
      failures = 0;
      usePlayerStore.setState({ playing: true, error: null });
    });
    audio.addEventListener("pause", () => {
      if (isActive() && !audio.ended) usePlayerStore.setState({ playing: false });
    });
    audio.addEventListener("ended", () => {
      if (!isActive() || handingOver) return;
      advance(false, 0);
    });
    audio.addEventListener("error", () => {
      if (!isActive() || !audio.getAttribute("src")) return;
      const { items, current } = usePlayerStore.getState();
      usePlayerStore.setState({ error: current?.title ?? null });
      if (++failures >= items.length) usePlayerStore.getState().stop();
      else advance(true, 0);
    });
    return deck;
  };
  decks = [make(), make()];
  return decks;
}

/** Starts the next track early so it overlaps the end of the current one. */
function maybeHandOver(time: number, duration: number) {
  const { crossfade, pos, order, repeat } = usePlayerStore.getState();
  if (handingOver || crossfade <= 0 || duration <= 0) return;
  const remaining = duration - time;
  // Short tracks crossfade over at most half their length.
  const window = Math.min(crossfade, duration / 2);
  if (remaining > window) return;
  const target = nextPosition(pos, order.length, repeat, false);
  if (target === null) return;
  handingOver = true;
  switchTo(target, remaining);
}

/** Plays order[target] on the free deck, fading the current one out over `fadeSeconds`. */
function switchTo(target: number, fadeSeconds: number) {
  const [a, b] = engine();
  const state = usePlayerStore.getState();
  const item = state.items[state.order[target] ?? -1];
  if (!item) return;
  const from = active === 0 ? a : b;
  const to = active === 0 ? b : a;

  // Only a playing track fades out; a paused one simply gives way.
  const crossfading = fadeSeconds > 0 && !from.audio.paused;
  if (crossfading) fade(from, 0, fadeSeconds, () => release(from));
  else release(from);

  to.fade = null;
  to.audio.src = item.url;
  to.gain = crossfading ? 0 : 1;
  applyVolume(to);
  active = active === 0 ? 1 : 0;
  usePlayerStore.setState({ pos: target, current: item, position: 0, duration: 0 });
  const done = () => {
    handingOver = false;
  };
  void to.audio.play().then(() => fade(to, 1, crossfading ? fadeSeconds : 0, done), done);
}

/** Moves on after a track ends or fails (`manual` for skips). */
function advance(manual: boolean, fadeSeconds: number) {
  const { pos, order, repeat } = usePlayerStore.getState();
  const target = nextPosition(pos, order.length, repeat, manual);
  if (target === null) {
    const [a, b] = engine();
    release(active === 0 ? a : b);
    usePlayerStore.setState({ playing: false, position: 0 });
    return;
  }
  switchTo(target, fadeSeconds);
}

function activeDeck(): Deck {
  const [a, b] = engine();
  return active === 0 ? a : b;
}

function manualFade(): number {
  return Math.min(usePlayerStore.getState().crossfade, MANUAL_FADE_S);
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...loadPrefs(),
  items: [],
  order: [],
  pos: 0,
  current: null,
  playing: false,
  position: 0,
  duration: 0,
  error: null,

  playList(items, start) {
    if (items.length === 0) return;
    const first = Math.min(Math.max(start, 0), items.length - 1);
    const order = makeOrder(items.length, first, get().shuffle);
    handingOver = false;
    failures = 0;
    set({ items, order, error: null });
    switchTo(order.indexOf(first), get().playing ? manualFade() : 0);
  },

  toggle() {
    if (!get().current) return;
    const deck = activeDeck();
    if (deck.audio.paused) {
      void deck.audio.play();
    } else {
      // A pause in the middle of a crossfade keeps only the incoming track.
      for (const d of engine()) if (d !== deck) release(d);
      handingOver = false;
      deck.fade = null;
      deck.gain = 1;
      applyVolume(deck);
      deck.audio.pause();
    }
  },

  next() {
    if (!get().current) return;
    handingOver = false;
    advance(true, get().playing ? manualFade() : 0);
  },

  previous() {
    if (!get().current) return;
    const deck = activeDeck();
    if (deck.audio.currentTime > RESTART_THRESHOLD_S) {
      deck.audio.currentTime = 0;
      return;
    }
    const { pos, order, repeat } = get();
    const target = previousPosition(pos, order.length, repeat);
    if (target === null) deck.audio.currentTime = 0;
    else {
      handingOver = false;
      switchTo(target, get().playing ? manualFade() : 0);
    }
  },

  seek(seconds) {
    const deck = activeDeck();
    if (!get().current || !Number.isFinite(seconds)) return;
    deck.audio.currentTime = Math.max(0, seconds);
    set({ position: deck.audio.currentTime });
  },

  setVolume(volume) {
    set({ volume: Math.min(1, Math.max(0, volume)), muted: false });
    savePrefs(get());
    if (decks) decks.forEach(applyVolume);
  },

  toggleMute() {
    set({ muted: !get().muted });
    savePrefs(get());
    if (decks) decks.forEach(applyVolume);
  },

  setRepeat(repeat) {
    set({ repeat });
    savePrefs(get());
  },

  setShuffle(shuffle) {
    const { order, pos } = get();
    set({ shuffle, ...(order.length > 0 ? reorder(order, pos, shuffle) : {}) });
    savePrefs(get());
  },

  setCrossfade(seconds) {
    set({ crossfade: clampCrossfade(seconds) });
    savePrefs(get());
  },

  stop() {
    if (decks) decks.forEach(release);
    handingOver = false;
    set({ playing: false, current: null, items: [], order: [], pos: 0, position: 0, duration: 0 });
  },
}));
