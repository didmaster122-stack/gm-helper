import { useMemo, useState } from "react";
import { ru } from "../../../shared/i18n/ru";
import { Modal, SearchInput } from "../../../shared/ui";
import { searchTracks } from "../domain/search";
import { formatDuration, trackName } from "../domain/tracks";
import type { Track } from "../domain/types";
import { useMusicStore } from "../store";
import { useEditorStore } from "./store";

const t = ru.music.editor;
const LIMIT = 200;

/** Chooses a catalog track to add as an editor source. */
export function SourcePicker({
  onPick,
  onClose,
}: {
  onPick: (track: Track) => void;
  onClose: () => void;
}) {
  const entries = useMusicStore((s) => s.entries);
  const used = useEditorStore((s) => s.history.present.sources.map((x) => x.trackId).join("\n"));
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchTracks(entries, query, { kind: "all" }).filter((track) => !track.missing),
    [entries, query],
  );
  const inEditor = new Set(used.split("\n"));

  return (
    <Modal title={t.pickTitle} onClose={onClose}>
      <div className="source-picker">
        <SearchInput
          placeholder={t.pickSearch}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <ul className="source-picker-list">
          {results.slice(0, LIMIT).map((track) => {
            const added = inEditor.has(track.id);
            return (
              <li key={track.id}>
                <button
                  type="button"
                  disabled={added}
                  title={added ? t.inEditor : track.relPath}
                  onClick={() => onPick(track)}
                >
                  <span className="source-picker-title">{trackName(track)}</span>
                  <span className="muted">
                    {[track.category, track.collection].filter(Boolean).join(" / ")}
                  </span>
                  <span className="muted">{formatDuration(track.durationMs)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {results.length === 0 && <p className="muted">{t.pickNone}</p>}
        {results.length > LIMIT && <p className="muted">{t.pickMore(results.length - LIMIT)}</p>}
      </div>
    </Modal>
  );
}
