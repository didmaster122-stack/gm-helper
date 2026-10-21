import { useState, type CSSProperties } from "react";
import {
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { IconButton } from "../../shared/ui";
import { CROSSFADE_MAX_S, type Repeat as RepeatMode } from "./domain/queue";
import { formatDuration } from "./domain/tracks";
import { usePlayerStore } from "./player";

const t = ru.music.player;
const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };

function SeekBar({ variant = "full" }: { variant?: "full" | "mini" }) {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const seek = usePlayerStore((s) => s.seek);
  // While dragging, the thumb follows the mouse instead of playback.
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? position;

  const range = (
    <input
      type="range"
      className="seek-bar"
      min={0}
      max={duration || 1}
      step={0.1}
      value={Math.min(shown, duration || 1)}
      disabled={duration <= 0}
      aria-label={t.seek}
      style={{ "--progress": `${duration > 0 ? (shown / duration) * 100 : 0}%` } as CSSProperties}
      onChange={(e) => setDragging(Number(e.target.value))}
      onPointerUp={() => {
        if (dragging !== null) seek(dragging);
        setDragging(null);
      }}
      onKeyUp={() => {
        if (dragging !== null) seek(dragging);
        setDragging(null);
      }}
    />
  );
  if (variant === "mini") {
    return (
      <div className="mini-seek">
        {range}
        <div className="mini-times">
          <span>{formatDuration(shown * 1000)}</span>
          <span>{formatDuration(duration > 0 ? duration * 1000 : null)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="seek">
      <span className="seek-time">{formatDuration(shown * 1000)}</span>
      {range}
      <span className="seek-time">{formatDuration(duration > 0 ? duration * 1000 : null)}</span>
    </div>
  );
}

function PlayButton({
  size = "md",
  withTitle = false,
}: {
  size?: "md" | "sm";
  withTitle?: boolean;
}) {
  const playing = usePlayerStore((s) => s.playing);
  const current = usePlayerStore((s) => s.current);
  const toggle = usePlayerStore((s) => s.toggle);
  const label = playing ? t.pause : t.play;
  return (
    <IconButton
      icon={playing ? Pause : Play}
      variant="primary"
      size={size}
      className="play-button"
      label={withTitle && current ? `${label}: ${current.title}` : label}
      onClick={toggle}
      disabled={!current}
    />
  );
}

function Transport({ size = "md" }: { size?: "md" | "sm" }) {
  const current = usePlayerStore((s) => s.current);
  const next = usePlayerStore((s) => s.next);
  const previous = usePlayerStore((s) => s.previous);
  return (
    <div className="transport">
      <IconButton
        icon={SkipBack}
        size={size}
        label={t.previous}
        onClick={previous}
        disabled={!current}
      />
      <PlayButton size={size} />
      <IconButton
        icon={SkipForward}
        size={size}
        label={t.next}
        onClick={next}
        disabled={!current}
      />
    </div>
  );
}

function VolumeControl({ compact = false }: { compact?: boolean }) {
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const level = muted ? 0 : volume;
  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;
  return (
    <div className={compact ? "volume compact" : "volume"}>
      <IconButton icon={Icon} size="sm" label={muted ? t.unmute : t.mute} onClick={toggleMute} />
      <input
        type="range"
        className="volume-bar"
        min={0}
        max={1}
        step={0.01}
        value={level}
        aria-label={t.volume}
        title={`${t.volume}: ${Math.round(level * 100)}%`}
        style={{ "--progress": `${level * 100}%` } as CSSProperties}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
    </div>
  );
}

/** Full player at the bottom of the music screen. */
export function PlayerBar() {
  const current = usePlayerStore((s) => s.current);
  const error = usePlayerStore((s) => s.error);
  const repeat = usePlayerStore((s) => s.repeat);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const crossfade = usePlayerStore((s) => s.crossfade);
  const setRepeat = usePlayerStore((s) => s.setRepeat);
  const setShuffle = usePlayerStore((s) => s.setShuffle);
  const setCrossfade = usePlayerStore((s) => s.setCrossfade);

  return (
    <div className="player-bar">
      <div className="now-playing">
        <span className="now-cover" aria-hidden>
          <Music />
        </span>
        <div className="now-text">
          <strong>{current ? current.title : t.nothing}</strong>
          <span className={error ? "error" : "muted"}>
            {error ? t.failed(error) : current ? "" : t.nothingHint}
          </span>
        </div>
      </div>

      <div className="player-center">
        <div className="player-buttons">
          <IconButton
            icon={Shuffle}
            size="sm"
            label={t.shuffle}
            active={shuffle}
            onClick={() => setShuffle(!shuffle)}
          />
          <Transport />
          <IconButton
            icon={repeat === "one" ? Repeat1 : Repeat}
            size="sm"
            label={t.repeat[repeat]}
            active={repeat !== "off"}
            onClick={() => setRepeat(NEXT_REPEAT[repeat])}
          />
        </div>
        <SeekBar />
      </div>

      <div className="player-side">
        <label className="crossfade" title={t.crossfade}>
          <span>{t.crossfade}</span>
          <select value={crossfade} onChange={(e) => setCrossfade(Number(e.target.value))}>
            {Array.from({ length: CROSSFADE_MAX_S + 1 }, (_, s) => (
              <option key={s} value={s}>
                {t.crossfadeValue(s)}
              </option>
            ))}
          </select>
        </label>
        <VolumeControl />
      </div>
    </div>
  );
}

interface MiniPlayerProps {
  onOpen: () => void;
  /** Folded spine: a single play / pause button. */
  collapsed?: boolean;
}

/** Compact player in the spine, on every screen except "Музыка" itself. */
export function MiniPlayer({ onOpen, collapsed = false }: MiniPlayerProps) {
  const current = usePlayerStore((s) => s.current);
  if (!current) return null;
  if (collapsed) return <PlayButton size="sm" withTitle />;
  return (
    <div className="mini-player">
      <button type="button" className="mini-title" title={t.openMusic} onClick={onOpen}>
        <Music aria-hidden />
        <span>{current.title}</span>
      </button>
      <SeekBar variant="mini" />
      <div className="mini-controls">
        <Transport size="sm" />
        <VolumeControl compact />
      </div>
    </div>
  );
}
