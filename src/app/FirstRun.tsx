import { Dices, FolderOpen, FolderX } from "lucide-react";
import { pickDirectory } from "../shared/fs";
import { ru } from "../shared/i18n/ru";
import { Button } from "../shared/ui";
import { useAppStore } from "./store";

/** Shown until a library folder is chosen, or when the saved one disappeared. */
export function FirstRun() {
  const libraryRoot = useAppStore((s) => s.libraryRoot);
  const missing = useAppStore((s) => s.libraryRootMissing);
  const setLibraryRoot = useAppStore((s) => s.setLibraryRoot);

  async function pick() {
    const path = await pickDirectory(ru.firstRun.dialogTitle);
    if (path) await setLibraryRoot(path);
  }

  const Icon = missing ? FolderX : Dices;
  return (
    <div className="first-run">
      <div className="card first-run-card">
        <span className={missing ? "first-run-mark error" : "first-run-mark"} aria-hidden>
          <Icon />
        </span>
        <h1>{missing ? ru.firstRun.missingTitle : ru.firstRun.title}</h1>
        <p className="muted">
          {missing && libraryRoot ? ru.firstRun.missingText(libraryRoot) : ru.firstRun.text}
        </p>
        {!missing && <code className="path">{ru.firstRun.structureHint}</code>}
        <Button variant="primary" icon={FolderOpen} onClick={pick}>
          {ru.firstRun.pick}
        </Button>
      </div>
    </div>
  );
}
