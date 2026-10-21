import { createPortal } from "react-dom";
import { ru } from "../i18n/ru";
import { useMentionMenu } from "./extension";

const WIDTH = 300;
const GAP = 4;

/** The `@` list of the editor being typed in. Rendered once by the app. */
export function MentionMenu() {
  const { items, index, rect, pick } = useMentionMenu();
  if (!rect || !pick) return null;

  const left = Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8));
  // Above the line when there is no room below.
  const below = rect.bottom + 280 < window.innerHeight;
  const style = below
    ? { left, top: rect.bottom + GAP, width: WIDTH }
    : { left, bottom: window.innerHeight - rect.top + GAP, width: WIDTH };

  return createPortal(
    <div className="mention-menu" style={style} role="listbox">
      {items.length === 0 ? (
        <div className="mention-menu-empty">{ru.mentions.nothing}</div>
      ) : (
        items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={i === index}
            className={i === index ? "mention-option active" : "mention-option"}
            // Keep the focus in the editor.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(item)}
          >
            <span className="mention-option-title">{item.title}</span>
            <span className="mention-option-kind">{ru.mentions.kinds[item.kind]}</span>
          </button>
        ))
      )}
    </div>,
    document.body,
  );
}
