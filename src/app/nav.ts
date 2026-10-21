import {
  Images,
  Map as MapIcon,
  Music,
  NotebookPen,
  ScrollText,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { ru } from "../shared/i18n/ru";
import type { ModuleId } from "./store";

export interface NavItem {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Sections of the spine, top to bottom. Ctrl+1…6 follow the same order. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: ru.nav.groups.prep,
    items: [
      { id: "library", label: ru.nav.library, icon: Images },
      { id: "battlemaps", label: ru.nav.battlemaps, icon: MapIcon },
      { id: "notes", label: ru.nav.notes, icon: NotebookPen },
    ],
  },
  {
    title: ru.nav.groups.world,
    items: [
      { id: "relations", label: ru.nav.relations, icon: Waypoints },
      { id: "timeline", label: ru.nav.timeline, icon: ScrollText },
    ],
  },
  {
    title: ru.nav.groups.table,
    items: [{ id: "music", label: ru.nav.music, icon: Music }],
  },
];

export const MODULE_ORDER: ModuleId[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));

export const MODULE_SHORTCUTS: Record<ModuleId, string> = {
  ...(Object.fromEntries(MODULE_ORDER.map((id, i) => [id, `Ctrl+${i + 1}`])) as Record<
    ModuleId,
    string
  >),
  settings: "Ctrl+,",
};

export const SIDEBAR_SHORTCUT = "Ctrl+\\";
