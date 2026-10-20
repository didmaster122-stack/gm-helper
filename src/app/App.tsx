import { useEffect } from "react";
import { ru } from "../shared/i18n/ru";
import { EmptyState } from "../shared/ui";
import { CampaignSwitcher, RequireCampaign, useActiveCampaign } from "../modules/campaigns";
import { LibraryScreen } from "../modules/library";
import { BattlemapScreen } from "../modules/battlemap";
import { RelationsScreen } from "../modules/relations";
import { TimelineScreen } from "../modules/timeline";
import { SettingsScreen } from "../modules/settings";
import { FirstRun } from "./FirstRun";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "./store";

function CurrentModule() {
  const module = useAppStore((s) => s.module);
  const libraryRoot = useAppStore((s) => s.libraryRoot);
  const setLibraryRoot = useAppStore((s) => s.setLibraryRoot);
  const campaign = useActiveCampaign();

  switch (module) {
    case "library":
      return libraryRoot ? (
        <LibraryScreen libraryRoot={libraryRoot} preferredSystem={campaign?.system ?? null} />
      ) : null;
    case "battlemaps":
      return (
        <RequireCampaign libraryRoot={libraryRoot}>
          {(campaign) => <BattlemapScreen campaign={campaign} />}
        </RequireCampaign>
      );
    case "relations":
      return (
        <RequireCampaign libraryRoot={libraryRoot}>
          {(campaign) => <RelationsScreen campaign={campaign} />}
        </RequireCampaign>
      );
    case "timeline":
      return (
        <RequireCampaign libraryRoot={libraryRoot}>
          {(campaign) => <TimelineScreen campaign={campaign} />}
        </RequireCampaign>
      );
    case "settings":
      return <SettingsScreen libraryRoot={libraryRoot} onLibraryRootChange={setLibraryRoot} />;
  }
}

export function App() {
  const status = useAppStore((s) => s.status);
  const libraryRoot = useAppStore((s) => s.libraryRoot);
  const missing = useAppStore((s) => s.libraryRootMissing);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (status.kind === "loading") {
    return <div className="center muted">{ru.common.loading}</div>;
  }
  if (status.kind === "error") {
    return (
      <EmptyState
        title={ru.startup.errorTitle}
        text={status.message}
        action={
          <button type="button" onClick={() => void init()}>
            {ru.common.retry}
          </button>
        }
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
        </header>
        <main className="content">
          <CurrentModule />
        </main>
      </div>
    </div>
  );
}
