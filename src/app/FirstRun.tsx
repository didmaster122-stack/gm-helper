import { Dices, FolderOpen } from "lucide-react";
import { pickDirectory } from "../shared/fs";
import { ru } from "../shared/i18n/ru";
import { Button } from "../shared/ui";
import { useAppStore } from "./store";

/** Shown until a library folder is chosen, or when the saved one disappeared. */
export function FirstRun() {
  const libraryRoot = useAppStore((s) => s.libraryRoot);
  const missing = useAppStore((s) => s.libraryRootMissing);
  const setLibraryRoot = useAppStore((s) => s.setLibraryRoot);
  const t = ru.firstRun;

  async function pick() {
    const path = await pickDirectory(t.dialogTitle);
    if (path) await setLibraryRoot(path);
  }

  return (
    <div className="welcome">
      <section className="welcome-hero">
        <div className="welcome-top">
          <div className="welcome-wordmark">
            <Dices aria-hidden />
            {ru.appName}
          </div>
        </div>
        <div className="welcome-intro">
          <div className="welcome-eyebrow">{missing ? t.missingEyebrow : t.eyebrow}</div>
          <h1 className="welcome-title">{missing ? t.missingTitle : t.title}</h1>
          <p className="welcome-meta">
            {missing && libraryRoot ? t.missingText(libraryRoot) : t.text}
          </p>
          <div className="welcome-actions">
            <Button variant="primary" icon={FolderOpen} onClick={pick}>
              {t.pick}
            </Button>
          </div>
        </div>
      </section>
      <section className="welcome-side">
        <div className="welcome-section">
          <h2>{t.structureTitle}</h2>
          <pre className="first-run-structure">{t.structureExample}</pre>
          <p className="muted">{t.structureNote}</p>
        </div>
      </section>
    </div>
  );
}
