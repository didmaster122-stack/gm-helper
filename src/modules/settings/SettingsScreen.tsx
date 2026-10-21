import type { ReactNode } from "react";
import { FolderOpen, Monitor, Moon, Sun } from "lucide-react";
import { pickDirectory } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { Button, ScreenHeader, Segmented, useThemeStore } from "../../shared/ui";
import { BackupSettings } from "../backup";
import { CellTypesSettings, ObjectsSettings } from "../battlemap";
import { CampaignList } from "../campaigns";
import { RelationTypesSettings } from "../relations";
import { DbBackupSettings, ErrorLogSettings } from "./DbBackupSettings";

interface SettingsScreenProps {
  libraryRoot: string | null;
  onLibraryRootChange: (path: string) => Promise<void>;
  musicRoot: string | null;
  onMusicRootChange: (path: string) => Promise<void>;
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <header>
        <h3>{title}</h3>
        <p className="hint">{hint}</p>
      </header>
      <div className="settings-control">{children}</div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="settings-group">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function SettingsScreen({
  libraryRoot,
  onLibraryRootChange,
  musicRoot,
  onMusicRootChange,
}: SettingsScreenProps) {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  async function changeRoot() {
    const path = await pickDirectory(ru.firstRun.dialogTitle, libraryRoot ?? undefined);
    if (path) await onLibraryRootChange(path);
  }

  async function changeMusicRoot() {
    const path = await pickDirectory(ru.music.rootDialogTitle, musicRoot ?? undefined);
    if (path) await onMusicRootChange(path);
  }

  return (
    <div className="screen settings">
      <ScreenHeader title={ru.settings.title} summary={ru.settings.summary} />

      <Group title={ru.settings.groups.general}>
        <Section title={ru.settings.appearance} hint={ru.settings.appearanceHint}>
          <Segmented
            label={ru.theme.label}
            value={preference}
            onChange={setPreference}
            options={[
              { value: "system", label: ru.theme.system, icon: Monitor },
              { value: "light", label: ru.theme.light, icon: Sun },
              { value: "dark", label: ru.theme.dark, icon: Moon },
            ]}
          />
        </Section>

        <Section title={ru.settings.libraryRoot} hint={ru.settings.libraryRootHint}>
          <div className="path-row">
            <code className="path">{libraryRoot}</code>
            <Button icon={FolderOpen} onClick={changeRoot}>
              {ru.common.change}
            </Button>
          </div>
        </Section>

        <Section title={ru.settings.musicRoot} hint={ru.settings.musicRootHint}>
          <div className="path-row">
            <code className="path">{musicRoot ?? ru.settings.musicRootNone}</code>
            <Button icon={FolderOpen} onClick={() => void changeMusicRoot()}>
              {ru.common.change}
            </Button>
          </div>
        </Section>
      </Group>

      <Group title={ru.settings.groups.data}>
        <Section title={ru.settings.campaigns} hint={ru.settings.campaignsHint}>
          <CampaignList libraryRoot={libraryRoot} />
        </Section>

        <Section title={ru.settings.backup} hint={ru.settings.backupHint}>
          <BackupSettings libraryRoot={libraryRoot} />
        </Section>

        <Section title={ru.settings.dbBackups} hint={ru.settings.dbBackupsHint}>
          <DbBackupSettings />
        </Section>

        <Section title={ru.settings.errorLog} hint={ru.settings.errorLogHint}>
          <ErrorLogSettings />
        </Section>
      </Group>

      <Group title={ru.settings.groups.references}>
        <Section title={ru.cellTypes.title} hint={ru.settings.cellTypesHint}>
          <CellTypesSettings libraryRoot={libraryRoot} />
        </Section>

        <Section title={ru.objects.title} hint={ru.settings.objectsHint}>
          <ObjectsSettings libraryRoot={libraryRoot} />
        </Section>

        <Section title={ru.relations.types.title} hint={ru.settings.relationTypesHint}>
          <RelationTypesSettings />
        </Section>
      </Group>
    </div>
  );
}
