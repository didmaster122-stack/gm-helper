import { pickDirectory } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { CampaignList } from "../campaigns";

interface SettingsScreenProps {
  libraryRoot: string | null;
  onLibraryRootChange: (path: string) => Promise<void>;
}

export function SettingsScreen({ libraryRoot, onLibraryRootChange }: SettingsScreenProps) {
  async function changeRoot() {
    const path = await pickDirectory(ru.firstRun.dialogTitle, libraryRoot ?? undefined);
    if (path) await onLibraryRootChange(path);
  }

  return (
    <div className="screen settings">
      <h1>{ru.settings.title}</h1>

      <section className="card">
        <h2>{ru.settings.libraryRoot}</h2>
        <div className="path-row">
          <code className="path">{libraryRoot}</code>
          <button type="button" onClick={changeRoot}>
            {ru.common.change}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>{ru.settings.campaigns}</h2>
        <CampaignList libraryRoot={libraryRoot} />
      </section>
    </div>
  );
}
