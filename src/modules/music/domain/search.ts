import { splitExtension } from "../../../shared/catalog/paths";
import { buildSearchText, scoreText, tokenize, type SearchText } from "../../../shared/search/text";
import { matchesSelection, trackName } from "./tracks";
import type { MusicSelection, Track } from "./types";

export interface TrackEntry extends SearchText {
  track: Track;
}

/** Searchable text: display name, file name and tags (spec §6.2). */
export function buildTrackEntry(track: Track): TrackEntry {
  return {
    track,
    ...buildSearchText([trackName(track), splitExtension(track.fileName).base, ...track.tags]),
  };
}

function byName(a: Track, b: Track): number {
  return trackName(a).localeCompare(trackName(b), "ru", { sensitivity: "base", numeric: true });
}

/** Tracks in the selection matching the query, best first; all by name for an empty query. */
export function searchTracks(
  entries: readonly TrackEntry[],
  query: string,
  selection: MusicSelection,
): Track[] {
  const words = tokenize(query);
  const inSelection = entries.filter((e) => matchesSelection(e.track, selection));
  if (words.length === 0) return inSelection.map((e) => e.track).sort(byName);
  return inSelection
    .map((e) => ({ track: e.track, score: scoreText(words, e) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || byName(a.track, b.track))
    .map((r) => r.track);
}
