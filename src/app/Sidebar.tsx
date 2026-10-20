import {
  Dices,
  Images,
  Map as MapIcon,
  Monitor,
  Moon,
  Music,
  ScrollText,
  Settings,
  Sun,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { MiniPlayer } from "../modules/music";
import { ru } from "../shared/i18n/ru";
import { Segmented, useThemeStore, withShortcut, type ThemePreference } from "../shared/ui";
import { MODULE_SHORTCUTS } from "./shortcuts";
import { useAppStore, type ModuleId } from "./store";

interface NavItem {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
}

const items: NavItem[] = [
  { id: "library", label: ru.nav.library, icon: Images },
  { id: "battlemaps", label: ru.nav.battlemaps, icon: MapIcon },
  { id: "relations", label: ru.nav.relations, icon: Waypoints },
  { id: "timeline", label: ru.nav.timeline, icon: ScrollText },
  { id: "music", label: ru.nav.music, icon: Music },
];

const themeOptions: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "system", label: ru.theme.system, icon: Monitor },
  { value: "light", label: ru.theme.light, icon: Sun },
  { value: "dark", label: ru.theme.dark, icon: Moon },
];

export function Sidebar() {
  const current = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  const button = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        className={item.id === current ? "nav-item active" : "nav-item"}
        onClick={() => setModule(item.id)}
        aria-current={item.id === current ? "page" : undefined}
        title={withShortcut(item.label, MODULE_SHORTCUTS[item.id])}
      >
        <Icon className="nav-icon" aria-hidden />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <Dices />
        </span>
        {ru.appName}
      </div>
      <div className="nav-list">{items.map(button)}</div>
      <div className="spacer" />
      {current !== "music" && <MiniPlayer onOpen={() => setModule("music")} />}
      <div className="nav-list">
        {button({ id: "settings", label: ru.nav.settings, icon: Settings })}
      </div>
      <Segmented
        className="block theme-switch"
        size="sm"
        label={ru.theme.label}
        value={preference}
        onChange={setPreference}
        options={themeOptions.map((o) => ({ ...o, iconOnly: true }))}
      />
    </nav>
  );
}
