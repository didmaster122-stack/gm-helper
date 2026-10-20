import { pickDirectory } from "../shared/fs";
import { ru } from "../shared/i18n/ru";
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

  return (
    <div className="first-run">
      <div className="card">
        <h1>{missing ? ru.firstRun.missingTitle : ru.firstRun.title}</h1>
        <p>{missing && libraryRoot ? ru.firstRun.missingText(libraryRoot) : ru.firstRun.text}</p>
        {!missing && <code className="path">{ru.firstRun.structureHint}</code>}
        <button type="button" className="primary" onClick={pick}>
          {ru.firstRun.pick}
        </button>
      </div>
    </div>
  );
}
