import { useState } from "react";
import { CircleCheck, FolderSearch, Play } from "lucide-react";
import { nameError } from "../../../shared/catalog/nameError";
import { joinRel, parentRel, toAbsolute } from "../../../shared/catalog/paths";
import { fileUrl, writeNewFile } from "../../../shared/fs";
import { ru } from "../../../shared/i18n/ru";
import { Button, Modal } from "../../../shared/ui";
import { trackName } from "../domain/tracks";
import { usePlayerStore } from "../player";
import { useMusicStore } from "../store";
import { projectDuration } from "./domain/project";
import { formatTime } from "./domain/timeScale";
import { encodeMp3, renderMix } from "./mixdown";
import { useEditorStore } from "./store";

const t = ru.music.editor.saveDialog;
const EXT = ".mp3";

type Stage =
  | { kind: "form" }
  | { kind: "rendering" }
  | { kind: "encoding"; percent: number }
  | { kind: "writing" }
  | { kind: "done"; relPath: string };

export function SaveDialog({ root, onClose }: { root: string; onClose: () => void }) {
  const project = useEditorStore((s) => s.history.present);
  const tree = useMusicStore((s) => s.tree);
  const tracks = useMusicStore((s) => s.tracks);
  const collections = tree.tops.flatMap((top) =>
    top.subs.map((sub) => ({ top: top.name, sub: sub.name, rel: joinRel(top.name, sub.name) })),
  );
  const first = project.sources[0];
  const [folder, setFolder] = useState(() => {
    const own = first && parentRel(first.relPath);
    return collections.find((c) => c.rel === own)?.rel ?? collections[0]?.rel ?? "";
  });
  const [name, setName] = useState(() => (first ? t.defaultName(first.title) : ""));
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);

  const siblings = tracks
    .filter((x) => !x.missing && parentRel(x.relPath) === folder)
    .map((x) => x.fileName);
  const fileName = `${name.trim()}${EXT}`;
  const invalid = nameError(fileName, siblings);
  const busy = stage.kind !== "form" && stage.kind !== "done";

  async function save() {
    setError(null);
    try {
      useEditorStore.getState().stop();
      setStage({ kind: "rendering" });
      const mix = await renderMix(project);
      setStage({ kind: "encoding", percent: 0 });
      const data = await encodeMp3(mix, (done) =>
        setStage({ kind: "encoding", percent: Math.round(done * 100) }),
      );
      setStage({ kind: "writing" });
      const relPath = joinRel(folder, fileName);
      await writeNewFile(toAbsolute(root, relPath), data);
      await useMusicStore.getState().sync();
      setStage({ kind: "done", relPath });
    } catch (e) {
      setError(t.failed(String(e)));
      setStage({ kind: "form" });
    }
  }

  const saved =
    stage.kind === "done" ? tracks.find((x) => x.relPath === stage.relPath && !x.missing) : null;

  function listen() {
    if (!saved) return;
    useEditorStore.getState().stop();
    usePlayerStore.getState().playList(
      [
        {
          trackId: saved.id,
          title: trackName(saved),
          url: fileUrl(toAbsolute(root, saved.relPath)),
        },
      ],
      0,
    );
    onClose();
  }

  function show() {
    if (!saved) return;
    const music = useMusicStore.getState();
    music.revealTrack(saved.id);
    music.setTab("listen");
    onClose();
  }

  let status: string | null = null;
  if (stage.kind === "rendering") status = t.rendering;
  else if (stage.kind === "encoding") status = t.encoding(stage.percent);
  else if (stage.kind === "writing") status = t.writing;

  return (
    <Modal
      title={t.title}
      onClose={() => !busy && onClose()}
      footer={
        stage.kind === "done" ? (
          <>
            <Button icon={FolderSearch} onClick={show} disabled={!saved}>
              {t.show}
            </Button>
            <Button variant="primary" icon={Play} onClick={listen} disabled={!saved}>
              {t.listen}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              {ru.common.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={() => void save()}
              disabled={busy || !folder || !!invalid}
            >
              {t.save}
            </Button>
          </>
        )
      }
    >
      {stage.kind === "done" ? (
        <div className="callout">
          <CircleCheck aria-hidden />
          {t.done(stage.relPath)}
        </div>
      ) : (
        <div className="form">
          {collections.length === 0 ? (
            <p className="error">{t.noCollections}</p>
          ) : (
            <label className="field">
              <span>{t.collection}</span>
              <select value={folder} onChange={(e) => setFolder(e.target.value)} disabled={busy}>
                {tree.tops
                  .filter((top) => top.subs.length > 0)
                  .map((top) => (
                    <optgroup key={top.name} label={top.name}>
                      {top.subs.map((sub) => (
                        <option key={sub.name} value={joinRel(top.name, sub.name)}>
                          {sub.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>{t.name}</span>
            <div className="field-inline">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                autoFocus
              />
              <span className="muted">{EXT}</span>
            </div>
            {name !== "" && invalid && <small className="error">{invalid}</small>}
          </label>
          <p className="muted">{t.info(formatTime(projectDuration(project)))}</p>
          {status && <p className="toolbar-status">{status}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
