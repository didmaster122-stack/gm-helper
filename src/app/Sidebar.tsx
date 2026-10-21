import { useEffect, useState } from "react";
import {
  CalendarDays,
  Keyboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { CampaignBlock, useActiveCampaign } from "../modules/campaigns";
import { MiniPlayer } from "../modules/music";
import { lastPlayed, NextSessionCard, nextSession, useSessionsStore } from "../modules/sessions";
import { formatDistance, localDay } from "../shared/dates";
import { ru } from "../shared/i18n/ru";
import { IconButton, Modal, useThemeStore, withShortcut } from "../shared/ui";
import {
  MODULE_SHORTCUTS,
  NAV_GROUPS,
  SEARCH_SHORTCUT,
  SIDEBAR_SHORTCUT,
  type NavItem,
} from "./nav";
import { useAppStore } from "./store";

/**
 * The spine: a dark strip in both themes with the campaign on top, sections by group,
 * the mini player and the footer. The active section joins the page.
 */
interface SidebarProps {
  onOpenHelp: () => void;
  onOpenSearch: () => void;
}

export function Sidebar({ onOpenHelp, onOpenSearch }: SidebarProps) {
  const current = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);
  const openWelcome = useAppStore((s) => s.openWelcome);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const theme = useThemeStore((s) => s.theme);
  const setPreference = useThemeStore((s) => s.setPreference);
  const campaign = useActiveCampaign();
  const loadSessions = useSessionsStore((s) => s.load);
  const sessions = useSessionsStore((s) => s.sessions);
  const sessionsFor = useSessionsStore((s) => s.campaignId);
  const [sessionOpen, setSessionOpen] = useState(false);
  const campaignId = campaign?.id ?? null;

  useEffect(() => {
    void loadSessions(campaignId);
  }, [loadSessions, campaignId]);

  const own = campaign && sessionsFor === campaign.id ? sessions : [];
  const last = lastPlayed(own);
  const next = nextSession(own);
  const sessionLabel = next
    ? ru.sessions.spineNext(
        next.number,
        next.date ? formatDistance(next.date, localDay(new Date())) : null,
      )
    : ru.sessions.spineSchedule;

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
    <>
      <nav className={collapsed ? "spine collapsed" : "spine"} aria-label={ru.nav.sections}>
        <CampaignBlock
          collapsed={collapsed}
          detail={last ? ru.sessions.spineLast(last.number) : null}
          onOpen={openWelcome}
        />
        {campaign && (
          <button
            type="button"
            className="spine-nav spine-session"
            onClick={() => setSessionOpen(true)}
            aria-label={collapsed ? sessionLabel : undefined}
            title={sessionLabel}
          >
            <CalendarDays aria-hidden />
            {!collapsed && <span>{sessionLabel}</span>}
          </button>
        )}
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
          <IconButton
            icon={Search}
            label={ru.search.open}
            shortcut={SEARCH_SHORTCUT}
            onClick={onOpenSearch}
          />
          <IconButton
            icon={Keyboard}
            label={ru.shortcuts.open}
            shortcut="F1"
            onClick={onOpenHelp}
          />
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
      {sessionOpen && campaign && (
        <Modal title={ru.sessions.next} onClose={() => setSessionOpen(false)}>
          <NextSessionCard
            onOpenNotes={() => {
              setSessionOpen(false);
              setModule("notes");
            }}
          />
        </Modal>
      )}
    </>
  );
}
