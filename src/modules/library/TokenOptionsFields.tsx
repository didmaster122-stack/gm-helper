import { ru } from "../../shared/i18n/ru";
import { ColorInput, Segmented } from "../../shared/ui";
import { CREATURE_SIZES, TOKEN_SIZES, tokenPixelSize } from "./domain/tokenCrop";
import { FRAME_COLORS, MAX_FRAME_WIDTH } from "./domain/tokenFrame";
import type { TokenDefaults } from "./tokenDefaults";

/** Thickness a frame gets when a colour is picked while there is none. */
const DEFAULT_FRAME_WIDTH = 6;

/** Creature size, resolution and frame: shared by the token editor and batch creation. */
export function TokenOptionsFields({
  value,
  onChange,
}: {
  value: TokenDefaults;
  onChange: (update: (options: TokenDefaults) => TokenDefaults) => void;
}) {
  const { size, cells, frame } = value;
  /** Picking a colour while there is no frame turns the frame on. */
  const setFrameColor = (color: string) =>
    onChange((o) => ({
      ...o,
      frame: { color, width: o.frame.width > 0 ? o.frame.width : DEFAULT_FRAME_WIDTH },
    }));

  return (
    <div className="token-options">
      <span>{ru.library.token.creature}</span>
      <div className="token-option-row">
        <Segmented
          size="sm"
          label={ru.library.token.creature}
          options={CREATURE_SIZES.map((n) => ({
            value: n,
            label: ru.library.token.cellsBadge(n),
            title: ru.library.token.creatureOption(n),
          }))}
          value={cells}
          onChange={(next) => onChange((o) => ({ ...o, cells: next }))}
        />
        <span className="muted">{ru.library.token.creatureName(cells)}</span>
      </div>
      <span>{ru.library.token.resolution}</span>
      <div className="token-option-row">
        <Segmented
          size="sm"
          label={ru.library.token.resolution}
          options={TOKEN_SIZES.map((px) => ({
            value: px,
            label: ru.library.token.resolutionOption(px),
          }))}
          value={size}
          onChange={(next) => onChange((o) => ({ ...o, size: next }))}
        />
        <span className="muted">{ru.library.token.sizeOption(tokenPixelSize(size, cells))}</span>
      </div>
      <span>{ru.library.token.frame}</span>
      <div className="token-option-row">
        <div className="frame-colors" role="radiogroup" aria-label={ru.library.token.frame}>
          {FRAME_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={frame.width > 0 && frame.color === color}
              className="frame-swatch"
              style={{ background: color }}
              title={ru.library.token.frameColor(color)}
              aria-label={ru.library.token.frameColor(color)}
              onClick={() => setFrameColor(color)}
            />
          ))}
          <ColorInput
            key={frame.color}
            value={frame.color}
            title={ru.library.token.frameCustom}
            onCommit={setFrameColor}
          />
        </div>
        <input
          type="range"
          className="frame-width"
          min={0}
          max={MAX_FRAME_WIDTH}
          step={0.5}
          value={frame.width}
          title={ru.library.token.frameWidth}
          aria-label={ru.library.token.frameWidth}
          onChange={(e) => {
            const width = Number(e.target.value);
            onChange((o) => ({ ...o, frame: { ...o.frame, width } }));
          }}
        />
        <span className="frame-width-value">{ru.library.token.frameWidthValue(frame.width)}</span>
      </div>
    </div>
  );
}
