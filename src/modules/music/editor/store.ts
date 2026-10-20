// Editor state. The project lives as long as the app (spec §6.4): switching sections keeps it.
import { create } from "zustand";
import { toAbsolute } from "../../../shared/catalog/paths";
import {
  initHistory,
  pushHistory,
  redo,
  replacePresent,
  undo,
  type History,
} from "../../../shared/history";
import {
  decodeFile,
  keepDecoded,
  playbackPosition,
  playMix,
  playSource,
  pruneDecoded,
  setLaneGains,
  stopPlayback,
} from "./audio";
import {
  addClip,
  addSource,
  emptyProject,
  MAX_SOURCES,
  projectDuration,
  type ClipContent,
  type Project,
} from "./domain/project";
import { clampZoom, ZOOM_DEFAULT } from "./domain/timeScale";
import { trackName } from "../domain/tracks";
import type { Track } from "../domain/types";
import { usePlayerStore } from "../player";

/** A fragment chosen on a source's waveform. */
export interface Fragment {
  sourceId: string;
  from: number;
  to: number;
}

export type Playback =
  { kind: "mix"; from: number } | { kind: "source"; sourceId: string; from: number; to: number };

export interface TrackRef {
  id: string;
  title: string;
  relPath: string;
}

interface EditorState {
  history: History<Project>;
  selectedClipId: string | null;
  /** Lane that paste goes to: the last one clicked. */
  activeLane: number;
  /** Playhead when stopped; playback starts here. */
  cursor: number;
  /** Pixels per second. */
  zoom: number;
  fragment: Fragment | null;
  clipboard: ClipContent | null;
  /** Track ids being decoded. */
  loading: string[];
  error: string | null;
  playback: Playback | null;
  /** Live position while playing (mix time or source time). */
  position: number;

  addTrack: (track: TrackRef, absPath: string) => Promise<void>;
  /** One undo step. */
  edit: (fn: (p: Project) => Project) => void;
  /** Part of a mouse drag: the first change makes the undo step, later ones extend it. */
  drag: (next: Project, first: boolean) => void;
  endDrag: () => void;
  undo: () => void;
  redo: () => void;
  selectClip: (id: string | null) => void;
  setActiveLane: (lane: number) => void;
  setCursor: (time: number) => void;
  setZoom: (zoom: number) => void;
  setFragment: (fragment: Fragment | null) => void;
  setClipboard: (content: ClipContent | null) => void;
  /** Puts the chosen fragment on a lane at the cursor. */
  placeFragment: (lane: number) => void;
  clearError: () => void;
  togglePlay: () => void;
  playFragment: () => void;
  stop: () => void;
}

const project = (s: { history: History<Project> }) => s.history.present;

let frame: number | null = null;
/** Project before the mouse drag in progress, or null. */
let dragBase: Project | null = null;

/** The catalog player and the editor do not play over each other. */
function pauseCatalogPlayer() {
  const player = usePlayerStore.getState();
  if (player.playing) player.toggle();
}

export const useEditorStore = create<EditorState>((set, get) => {
  /** Sets the history; playback follows the change. */
  function commit(history: History<Project>) {
    const before = get().history.present;
    set({ history });
    const after = history.present;
    if (before === after) return;
    const { selectedClipId, fragment, playback } = get();
    // Undo can remove what is selected.
    if (selectedClipId && !after.clips.some((c) => c.id === selectedClipId)) {
      set({ selectedClipId: null });
    }
    if (fragment && !after.sources.some((s) => s.id === fragment.sourceId)) {
      set({ fragment: null });
    }
    if (playback?.kind === "source" && !after.sources.some((s) => s.id === playback.sourceId)) {
      get().stop();
    } else if (playback?.kind === "mix") {
      if (before.lanes !== after.lanes) setLaneGains(after);
      // During a drag the mix restarts once, when the mouse is released.
      if (!dragBase && (before.clips !== after.clips || before.sources !== after.sources)) {
        restartMix();
      }
    }
  }

  function restartMix() {
    const from = playbackPosition() ?? get().cursor;
    playMix(project(get()), from);
    set({ playback: { kind: "mix", from }, position: from });
  }

  function startTicker() {
    if (frame !== null) return;
    const tick = () => {
      const { playback } = get();
      const position = playbackPosition();
      if (!playback || position === null) {
        frame = null;
        return;
      }
      const end = playback.kind === "mix" ? projectDuration(project(get())) : playback.to;
      if (position >= end) {
        // The mix returns to where it started; a fragment just stops.
        stopPlayback();
        set({ playback: null, position: playback.from });
        frame = null;
        return;
      }
      set({ position });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  return {
    history: initHistory(emptyProject()),
    selectedClipId: null,
    activeLane: 0,
    cursor: 0,
    zoom: ZOOM_DEFAULT,
    fragment: null,
    clipboard: null,
    loading: [],
    error: null,
    playback: null,
    position: 0,

    async addTrack(track, absPath) {
      const { history, loading } = get();
      if (loading.includes(track.id)) return;
      if (history.present.sources.some((s) => s.trackId === track.id)) return;
      if (history.present.sources.length + loading.length >= MAX_SOURCES) return;
      set({ loading: [...loading, track.id], error: null });
      try {
        const audio = await decodeFile(absPath);
        const id = crypto.randomUUID();
        const next = addSource(project(get()), {
          id,
          trackId: track.id,
          title: track.title,
          relPath: track.relPath,
          duration: audio.buffer.duration,
        });
        if (next !== project(get())) {
          keepDecoded(id, audio);
          commit(pushHistory(get().history, next));
          const { past, present, future } = get().history;
          pruneDecoded(
            new Set([...past, present, ...future].flatMap((p) => p.sources.map((s) => s.id))),
          );
          set({ fragment: { sourceId: id, from: 0, to: audio.buffer.duration } });
        }
      } catch (error) {
        set({ error: `${track.title}: ${String(error)}` });
      } finally {
        set({ loading: get().loading.filter((id) => id !== track.id) });
      }
    },

    edit(fn) {
      commit(pushHistory(get().history, fn(project(get()))));
    },

    drag(next, first) {
      const h = get().history;
      if (first || !dragBase) dragBase = h.present;
      commit(first ? pushHistory(h, next) : replacePresent(h, next));
    },

    endDrag() {
      const base = dragBase;
      dragBase = null;
      if (!base || get().playback?.kind !== "mix") return;
      if (base.clips !== project(get()).clips) restartMix();
    },

    undo() {
      commit(undo(get().history));
    },

    redo() {
      commit(redo(get().history));
    },

    selectClip(id) {
      const clip = project(get()).clips.find((c) => c.id === id);
      set({ selectedClipId: clip ? clip.id : null, ...(clip ? { activeLane: clip.lane } : {}) });
    },

    setActiveLane(lane) {
      set({ activeLane: lane });
    },

    setCursor(time) {
      const cursor = Math.max(0, time);
      set({ cursor });
      if (get().playback?.kind === "mix") {
        playMix(project(get()), cursor);
        set({ playback: { kind: "mix", from: cursor }, position: cursor });
      }
    },

    setZoom(zoom) {
      set({ zoom: clampZoom(zoom) });
    },

    setFragment(fragment) {
      set({ fragment });
    },

    setClipboard(content) {
      set({ clipboard: content });
    },

    placeFragment(lane) {
      const { fragment, cursor } = get();
      if (!fragment) return;
      const id = crypto.randomUUID();
      const content = {
        sourceId: fragment.sourceId,
        offset: fragment.from,
        length: fragment.to - fragment.from,
      };
      get().edit((p) => addClip(p, id, content, lane, cursor));
      if (project(get()).clips.some((c) => c.id === id)) {
        set({ selectedClipId: id, activeLane: lane });
      }
    },

    clearError() {
      set({ error: null });
    },

    togglePlay() {
      const { playback, cursor } = get();
      if (playback?.kind === "mix") {
        // Pause: the playhead stays where it is, the next play continues from there.
        const position = playbackPosition() ?? cursor;
        get().stop();
        set({ cursor: position });
        return;
      }
      const end = projectDuration(project(get()));
      if (end <= 0) return;
      const from = cursor >= end ? 0 : cursor;
      pauseCatalogPlayer();
      playMix(project(get()), from);
      set({ playback: { kind: "mix", from }, position: from, cursor: from });
      startTicker();
    },

    playFragment() {
      const { fragment, playback } = get();
      if (playback?.kind === "source") {
        get().stop();
        return;
      }
      if (!fragment || fragment.to <= fragment.from) return;
      pauseCatalogPlayer();
      playSource(fragment.sourceId, fragment.from, fragment.to);
      set({ playback: { kind: "source", ...fragment }, position: fragment.from });
      startTicker();
    },

    stop() {
      stopPlayback();
      set({ playback: null });
    },
  };
});

export const useProject = (): Project => useEditorStore((s) => s.history.present);

/** Adds a catalog track as an editor source (from the track card or the picker). */
export function addTrackToEditor(root: string, track: Track): void {
  void useEditorStore
    .getState()
    .addTrack(
      { id: track.id, title: trackName(track), relPath: track.relPath },
      toAbsolute(root, track.relPath),
    );
}
