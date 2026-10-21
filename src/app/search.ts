// Sources and actions of the app-wide search (spec §1.5): records of the modules, sections and
// commands of the app, and opening a found object in its section.
import { mapSearchRecords, showMap } from "../modules/battlemap";
import { useCampaignStore } from "../modules/campaigns";
import { artSearchRecords, showArt, useLibraryStore } from "../modules/library";
import { createTextNote, noteSearchRecords, showNoteById } from "../modules/notes";
import { relationSearchRecords, showCharacter, showFaction } from "../modules/relations";
import { eventSearchRecords, showEvent } from "../modules/timeline";
import { getDb } from "../shared/db";
import { ru } from "../shared/i18n/ru";
import type { SearchKind, SearchRecord } from "../shared/search/global";
import { useThemeStore } from "../shared/ui";
import { NAV_GROUPS } from "./nav";
import { useAppStore, type ModuleId } from "./store";

export interface Command {
  id: string;
  title: string;
  /** "Раздел" or "Команда", shown next to the title. */
  section: string;
  run: () => void | Promise<void>;
}

/** Sections and commands; the ones needing a campaign are left out when there is none. */
export function appCommands(openHelp: () => void): Command[] {
  const app = useAppStore.getState();
  const activeId = useCampaignStore.getState().activeId;
  const sections = [
    ...NAV_GROUPS.flatMap((g) => g.items),
    { id: "settings" as const, label: ru.nav.settings },
  ];
  const t = ru.search.commands;
  const commands: Command[] = [
    ...sections.map((s) => ({
      id: `section:${s.id}`,
      title: s.label,
      section: ru.search.section,
      run: () => app.setModule(s.id),
    })),
    {
      id: "welcome",
      title: t.welcome,
      section: ru.search.section,
      run: () => app.openWelcome(),
    },
    { id: "help", title: t.help, section: ru.search.command, run: openHelp },
    {
      id: "theme",
      title: t.theme,
      section: ru.search.command,
      run: () => {
        const { theme, setPreference } = useThemeStore.getState();
        setPreference(theme === "dark" ? "light" : "dark");
      },
    },
    { id: "sidebar", title: t.sidebar, section: ru.search.command, run: app.toggleSidebar },
  ];
  if (activeId) {
    commands.push({
      id: "new-note",
      title: t.newNote,
      section: ru.search.command,
      run: async () => {
        await createTextNote(activeId);
        app.setModule("notes");
      },
    });
  }
  return commands;
}

/** Everything searchable: objects of the running campaigns, arts on disk and the commands. */
export async function loadSearchRecords(commands: readonly Command[]): Promise<SearchRecord[]> {
  const db = await getDb();
  const campaignIds = useCampaignStore
    .getState()
    .campaigns.filter((c) => !c.archived)
    .map((c) => c.id);
  const sources = await Promise.all([
    relationSearchRecords(db, campaignIds),
    eventSearchRecords(db, campaignIds),
    noteSearchRecords(db, campaignIds),
    mapSearchRecords(db, campaignIds),
  ]);
  const commandRecords = commands.map((c): SearchRecord => ({
    kind: "command",
    id: c.id,
    campaignId: null,
    title: c.title,
  }));
  return [
    ...commandRecords,
    ...sources.flat(),
    ...artSearchRecords(useLibraryStore.getState().arts),
  ];
}

export const SEARCH_SECTIONS: Record<Exclude<SearchKind, "command">, ModuleId> = {
  character: "relations",
  faction: "relations",
  event: "timeline",
  note: "notes",
  battlemap: "battlemaps",
  art: "library",
};

/**
 * Shows a found object in its section. An object of another campaign makes that campaign active
 * first.
 */
export async function openSearchRecord(record: SearchRecord): Promise<void> {
  if (record.kind === "command") return;
  const { campaignId, id } = record;
  const campaigns = useCampaignStore.getState();
  if (campaignId && campaignId !== campaigns.activeId) await campaigns.setActive(campaignId);
  switch (record.kind) {
    case "character":
      if (campaignId) showCharacter(campaignId, id);
      break;
    case "faction":
      if (campaignId) showFaction(campaignId, id);
      break;
    case "event":
      if (campaignId) showEvent(campaignId, id);
      break;
    case "note":
      if (campaignId) showNoteById(campaignId, id);
      break;
    case "battlemap":
      await showMap(id);
      break;
    case "art":
      showArt(id);
      break;
  }
  useAppStore.getState().setModule(SEARCH_SECTIONS[record.kind]);
}
