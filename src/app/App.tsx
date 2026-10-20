import { useCallback, useEffect, useState } from "react";
import { Keyboard, TriangleAlert } from "lucide-react";
import { ru } from "../shared/i18n/ru";
import { Button, EmptyState, IconButton } from "../shared/ui";
import { CampaignSwitcher, RequireCampaign, useActiveCampaign } from "../modules/campaigns";
import { LibraryScreen } from "../modules/library";
import { BattlemapScreen } from "../modules/battlemap";
import { createCharacter, RelationsScreen, showCharacter } from "../modules/relations";
import { CharacterEvents, showEvent, TimelineScreen } from "../modules/timeline";
import { MusicScreen } from "../modules/music";
import { SettingsScreen } from "../modules/settings";
import { FirstRun } from "./FirstRun";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useGlobalShortcuts } from "./shortcuts";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "./store";

function CurrentModule() {
  const module = useAppStore((s) => s.module);
  const libraryRoot = useAppStore((s) => s.libraryRoot);
  const setLibraryRoot = useAppStore((s) => s.setLibraryRoot);
  const musicRoot = useAppStore((s) => s.musicRoot);
  const musicRootMissing = useAppStore((s) => s.musicRootMissing);
  const setMusicRoot = useAppStore((s) => s.setMusicRoot);
  const campaign = useActiveCampaign();
  const setModule = useAppStore((s) => s.setModule);

  switch (module) {
    case "library":
      return libraryRoot ? (
        <LibraryScreen
          libraryRoot={libraryRoot}
          preferredSystem={campaign?.system ?? null}
          characterTarget={
            campaign
              ? {
                  campaignName: campaign.name,
                  async create(name, artId, tokenId) {
                    await createCharacter(campaign.id, { name, kind: "npc", artId, tokenId });
                    setModule("relations");
                  },
                }
              : null
          }
        />
      ) : null;
    case "battlemaps":
      return (
        <RequireCampaign libraryRoot={libraryRoot}>
          {(campaign) => <BattlemapScreen campaign={campaign} libraryRoot={libraryRoot} />}
        </RequireCampaign>
      );
    case "relations":
      return (
        <RequireCampaign libraryRoot={libraryRoot}>
          {(campaign) =>
            libraryRoot ? (
              <RelationsScreen
                campaign={campaign}
                libraryRoot={libraryRoot}
                characterExtras={(characterId) => (
                  <CharacterEvents
                    campaignId={campaign.id}
                    characterId={characterId}
                    onOpenEvent={(id) => {
                      showEvent(id);
                      setModule("timeline");
                    }}
                  />
                )}
              />
            ) : null
          }
        </RequireCampaign>
      );
    case "timeline":
      return (
        <RequireCampaign libraryRoot={libraryRoot}>
          {(campaign) => (
            <TimelineScreen
              campaign={campaign}
              onOpenCharacter={(id) => {
                showCharacter(id);
                setModule("relations");
              }}
            />
          )}
        </RequireCampaign>
      );
    case "music":
      return (
        <MusicScreen
          musicRoot={musicRoot}
          rootMissing={musicRootMissing}
          onMusicRootChange={setMusicRoot}
        />
      );
    case "settings":
      return (
        <SettingsScreen
          libraryRoot={libraryRoot}
          onLibraryRootChange={setLibraryRoot}
          musicRoot={musicRoot}
          onMusicRootChange={setMusicRoot}
        />
      );
  }
}

export function App() {
  const status = useAppStore((s) => s.status);
  const libraryRoot = useAppStore((s) => s.libraryRoot);
  const missing = useAppStore((s) => s.libraryRootMissing);
  const init = useAppStore((s) => s.init);
  const setModule = useAppStore((s) => s.setModule);
  const [help, setHelp] = useState(false);
  const openHelp = useCallback(() => setHelp(true), []);
  useGlobalShortcuts(setModule, openHelp);

  useEffect(() => {
    void init();
  }, [init]);

  if (status.kind === "loading") {
    return (
      <div className="center">
        <div className="spinner" role="status" aria-label={ru.common.loading} />
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <EmptyState
        icon={TriangleAlert}
        tone="error"
        title={ru.startup.errorTitle}
        text={status.message}
        action={<Button onClick={() => void init()}>{ru.common.retry}</Button>}
      />
    );
  }
  if (!libraryRoot || missing) return <FirstRun />;

  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <CampaignSwitcher libraryRoot={libraryRoot} />
          <div className="spacer" />
          <IconButton icon={Keyboard} label={ru.shortcuts.open} shortcut="F1" onClick={openHelp} />
        </header>
        <main className="content">
          <CurrentModule />
        </main>
      </div>
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
    </div>
  );
}
