import { ru } from "../shared/i18n/ru";
import { Modal } from "../shared/ui";

const k = ru.shortcuts.keys;

const sections: { title: string; rows: [string[], string][] }[] = [
  {
    title: ru.shortcuts.global,
    rows: [
      [["Ctrl+1", "…", "Ctrl+5"], k.modules],
      [["Ctrl+,"], k.settings],
      [["Ctrl+F"], k.search],
      [["F1"], k.help],
      [["Space"], k.playPause],
    ],
  },
  {
    title: ru.shortcuts.editors,
    rows: [
      [["Ctrl+Z"], k.undo],
      [["Ctrl+Y"], k.redo],
      [["Delete"], k.delete],
      [["Esc"], k.escape],
      [[k.wheel], k.zoom],
    ],
  },
  {
    title: ru.shortcuts.battlemap,
    rows: [
      [["P", "B", "R", "G", "E", "V", "O"], k.tools],
      [["Space"], k.pan],
      [["R"], k.rotate],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={ru.shortcuts.title} onClose={onClose}>
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="subheading">{section.title}</h3>
          <dl className="shortcut-list">
            {section.rows.map(([keys, text]) => (
              <div key={text} style={{ display: "contents" }}>
                <dt>
                  {keys.map((key, i) =>
                    key === "…" || key === "+" ? (
                      <span key={i} className="muted">
                        {key}
                      </span>
                    ) : (
                      <kbd key={i}>{key}</kbd>
                    ),
                  )}
                </dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </Modal>
  );
}
