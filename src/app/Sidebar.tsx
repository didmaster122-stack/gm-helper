import { Keyboard, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun } from "lucide-react";
import { CampaignSwitcher } from "../modules/campaigns";
import { MiniPlayer } from "../modules/music";
import { ru } from "../shared/i18n/ru";
import { IconButton, useThemeStore, withShortcut } from "../shared/ui";
import { MODULE_SHORTCUTS, NAV_GROUPS, SIDEBAR_SHORTCUT, type NavItem } from "./nav";
import { useAppStore } from "./store";

/**
 * The spine: a dark strip in both themes with the campaign on top, sections by group,
 * the mini player and the footer. The active section joins the page.
 */
export function Sidebar({ onOpenHelp }: { onOpenHelp: () => void }) {
  const current = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);
  const libraryRoot = useAppStore((s) => s.libraryRoot);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const theme = useThemeStore((s) => s.theme);
  const setPreference = useThemeStore((s) => s.setPreference);

  const navButton = (item: NavItem) => {
    const Icon = item.icon;
    const active = item.id === current;
    return (
      <button
        key={item.id}
        type="button"
        className={active ? "spine-nav active" : "spine-nav"}
        onClick={() => setModule(item.id)}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={withShortcut(item.label, MODULE_SHORTCUTS[item.id])}
      >
        <Icon aria-hidden />
        {!collapsed && <span>{item.label}</span>}
      </button>
    );
  };

  return (
    <nav className={collapsed ? "spine collapsed" : "spine"} aria-label={ru.nav.sections}>
      <CampaignSwitcher libraryRoot={libraryRoot} collapsed={collapsed} />
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="spine-group" role="group" aria-label={group.title}>
          {!collapsed && <h4 aria-hidden>{group.title}</h4>}
          {group.items.map(navButton)}
        </div>
      ))}
      <div className="spacer" />
      <div className="spine-tools">
        {current !== "music" && (
          <MiniPlayer onOpen={() => setModule("music")} collapsed={collapsed} />
        )}
      </div>
      <div className="spine-group">
        {navButton({ id: "settings", label: ru.nav.settings, icon: Settings })}
      </div>
      <div className="spine-tools spine-foot">
        <IconButton icon={Keyboard} label={ru.shortcuts.open} shortcut="F1" onClick={onOpenHelp} />
        <IconButton
          icon={theme === "dark" ? Sun : Moon}
          label={theme === "dark" ? ru.theme.toLight : ru.theme.toDark}
          onClick={() => setPreference(theme === "dark" ? "light" : "dark")}
        />
        <div className="spacer" />
        <IconButton
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          label={collapsed ? ru.nav.expand : ru.nav.collapse}
          shortcut={SIDEBAR_SHORTCUT}
          onClick={toggleSidebar}
        />
      </div>
    </nav>
  );
}
