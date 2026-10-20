import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useRef } from "react";
import { AudioLines, FileX, Play } from "lucide-react";
import { joinRel } from "../../shared/catalog/paths";
import { ru } from "../../shared/i18n/ru";
import { formatDuration, trackName } from "./domain/tracks";
import type { Track } from "./domain/types";

const ROW = 40;

interface TrackListProps {
  tracks: readonly Track[];
  selectedId: string | null;
  /** Track playing right now (highlighted). */
  currentId: string | null;
  playing: boolean;
  /** Show the category/collection column (not inside one collection). */
  showPlace: boolean;
  onSelect: (track: Track) => void;
  onPlay: (index: number) => void;
}

/** Virtualised list: thousands of tracks stay smooth (spec §6.2). */
export function TrackList({
  tracks,
  selectedId,
  currentId,
  playing,
  showPlace,
  onSelect,
  onPlay,
}: TrackListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW,
    overscan: 12,
  });

  useEffect(() => {
    if (!selectedId) return;
    const index = tracks.findIndex((t) => t.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [selectedId, tracks, virtualizer]);

  const c = ru.music.columns;
  return (
    <div className={showPlace ? "track-table with-place" : "track-table"}>
      <div className="track-head" role="row">
        <span />
        <span>{c.title}</span>
        {showPlace && <span>{c.place}</span>}
        <span>{c.tags}</span>
        <span className="track-duration">{c.duration}</span>
      </div>
      <div className="track-scroll" ref={scrollRef} role="listbox" aria-label={ru.music.title}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((row) => {
            const track = tracks[row.index];
            if (!track) return null;
            return (
              <TrackRow
                key={track.id}
                track={track}
                index={row.index}
                top={row.start}
                selected={track.id === selectedId}
                current={track.id === currentId}
                playing={playing && track.id === currentId}
                showPlace={showPlace}
                onSelect={onSelect}
                onPlay={onPlay}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface TrackRowProps {
  track: Track;
  index: number;
  top: number;
  selected: boolean;
  current: boolean;
  playing: boolean;
  showPlace: boolean;
  onSelect: (track: Track) => void;
  onPlay: (index: number) => void;
}

const TrackRow = memo(function TrackRow({
  track,
  index,
  top,
  selected,
  current,
  playing,
  showPlace,
  onSelect,
  onPlay,
}: TrackRowProps) {
  const classes = ["track-row"];
  if (selected) classes.push("selected");
  if (current) classes.push("current");
  if (track.missing) classes.push("missing");
  return (
    <div
      className={classes.join(" ")}
      style={{ transform: `translateY(${top}px)` }}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      title={track.relPath}
      onClick={() => onSelect(track)}
      onDoubleClick={() => !track.missing && onPlay(index)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !track.missing) onPlay(index);
      }}
    >
      <span className="track-mark">
        {track.missing ? (
          <FileX aria-label={ru.music.track.missing} />
        ) : playing ? (
          <AudioLines className="playing" aria-hidden />
        ) : (
          <button
            type="button"
            className="track-play"
            aria-label={ru.music.track.play}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onPlay(index);
            }}
          >
            <Play aria-hidden />
          </button>
        )}
      </span>
      <span className="track-title">{trackName(track)}</span>
      {showPlace && (
        <span className="track-place">
          {track.unsorted
            ? ru.music.unsorted
            : joinRel(track.category ?? "", track.collection ?? "")}
        </span>
      )}
      <span className="track-tags">
        {track.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </span>
      <span className="track-duration">{formatDuration(track.durationMs)}</span>
    </div>
  );
});
