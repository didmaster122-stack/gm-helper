import { useCallback, useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { ru } from "../shared/i18n/ru";
import { Button, EmptyState, ErrorBoundary } from "../shared/ui";
import { RequireCampaign, useActiveCampaign } from "../modules/campaigns";
import { LibraryScreen } from "../modules/library";
import { BattlemapScreen } from "../modules/battlemap";
import { createCharacter, RelationsScreen, showCharacter } from "../modules/relations";
import { CharacterEvents, showEvent, TimelineScreen } from "../modules/timeline";
import { MusicScreen } from "../modules/music";
import { NotesScreen } from "../modules/notes";
import { SettingsScreen } from "../modules/settings";
import { FirstRun } from "./FirstRun";
import { SearchDialog } from "./SearchDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useGlobalShortcuts } from "./shortcuts";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "./store";
import { Welcome } from "./Welcome";

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
          campaignId={campaign?.id ?? null}
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
                      showEvent(campaign.id, id);
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
                showCharacter(campaign.id, id);
                setModule("relations");
              }}
            />
          )}
        </RequireCampaign>
      );
    case "notes":
      return (
        <RequireCampaign libraryRoot={libraryRoot}>
          {(campaign) =>
            libraryRoot ? <NotesScreen campaign={campaign} libraryRoot={libraryRoot} /> : null
          }
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
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const module = useAppStore((s) => s.module);
  const welcome = useAppStore((s) => s.welcome);
  const [help, setHelp] = useState(false);
  const [search, setSearch] = useState(false);
  const openHelp = useCallback(() => setHelp(true), []);
  const openSearch = useCallback(() => setSearch(true), []);
  useGlobalShortcuts({ setModule, openHelp, openSearch, toggleSidebar });

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
    <>
      {welcome ? (
        <Welcome onOpenHelp={openHelp} onOpenSearch={openSearch} />
      ) : (
        <div className="layout">
          <Sidebar onOpenHelp={openHelp} onOpenSearch={openSearch} />
          <main className="content">
            <ErrorBoundary resetKey={module}>
              <CurrentModule />
            </ErrorBoundary>
          </main>
        </div>
      )}
      {search && <SearchDialog onClose={() => setSearch(false)} onOpenHelp={openHelp} />}
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
    </>
  );
}
