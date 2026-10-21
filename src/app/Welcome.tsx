import { useEffect, useState } from "react";
import {
  ArrowRight,
  Dices,
  Image,
  Map as MapIcon,
  Moon,
  NotebookPen,
  Plus,
  ScrollText,
  Settings,
  Sun,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  CampaignCover,
  CampaignForm,
  useActiveCampaign,
  useCampaignStore,
  type Campaign,
} from "../modules/campaigns";
import { useLibraryStore } from "../modules/library";
import {
  campaignStatus,
  listAllSessions,
  nextSession,
  NextSessionCard,
  useSessionsStore,
  type Session,
} from "../modules/sessions";
import { formatMoment, localDay } from "../shared/dates";
import { getDb, type RecentKind } from "../shared/db";
import { ru } from "../shared/i18n/ru";
import { Button, ConfirmDialog, IconButton, useThemeStore } from "../shared/ui";
import { MODULE_SHORTCUTS } from "./nav";
import { loadRecent, RECENT_SECTIONS, showRecent } from "./recent";
import { useAppStore } from "./store";
import {
  campaignCardSummary,
  continueSummary,
  otherCampaigns,
  sessionsByCampaign,
  type RecentEntry,
} from "./welcomeData";

const KIND_ICONS: Record<RecentKind, LucideIcon> = {
  battlemap: MapIcon,
  note: NotebookPen,
  art: Image,
  event: ScrollText,
  character: UserRound,
};

/** Start screen: the campaign to continue, its recent objects and next session, other campaigns. */
export function Welcome({ onOpenHelp }: { onOpenHelp: () => void }) {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const campaign = useActiveCampaign();
  const libraryRoot = useAppStore((s) => s.libraryRoot);
  const setModule = useAppStore((s) => s.setModule);
  const loadSessions = useSessionsStore((s) => s.load);
  const sessions = useSessionsStore((s) => s.sessions);
  const sessionsFor = useSessionsStore((s) => s.campaignId);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [creating, setCreating] = useState(false);
  const campaignId = campaign?.id ?? null;

  useEffect(() => {
    void loadSessions(campaignId);
  }, [loadSessions, campaignId]);

  // Covers are arts of the library; opening it also starts the scan of the startup.
  useEffect(() => {
    if (libraryRoot) void useLibraryStore.getState().open(libraryRoot);
  }, [libraryRoot]);

  // Summaries of the other campaigns; reloaded when the active one's sessions change.
  useEffect(() => {
    let live = true;
    getDb()
      .then(listAllSessions)
      .then((list) => live && setAllSessions(list))
      .catch((error: unknown) => console.error(error));
    return () => {
      live = false;
    };
  }, [sessions, campaigns]);

  const own = campaign && sessionsFor === campaign.id ? sessions : [];

  return (
    <div className="welcome">
      <section className="welcome-hero">
        <WelcomeTop />
        {campaign ? (
          <>
            <Continue campaign={campaign} sessions={own} />
            <RecentList key={campaign.id} campaignId={campaign.id} />
          </>
        ) : (
          <div className="welcome-intro">
            <h1 className="welcome-title">
              {campaigns.length === 0 ? ru.welcome.firstTitle : ru.welcome.allDoneTitle}
            </h1>
            <p className="welcome-meta">
              {campaigns.length === 0 ? ru.welcome.firstText : ru.welcome.allDoneText}
            </p>
            <div className="welcome-actions">
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                {campaigns.length === 0 ? ru.welcome.firstCreate : ru.campaign.new}
              </Button>
            </div>
          </div>
        )}
        <div className="welcome-hints">
          <button type="button" onClick={onOpenHelp}>
            <kbd>F1</kbd>
            {ru.welcome.helpHint}
          </button>
        </div>
      </section>
      <section className="welcome-side">
        {campaign && (
          <div className="welcome-section">
            <h2>{ru.sessions.next}</h2>
            <div className="welcome-next">
              <NextSessionCard
                campaignName={campaign.name}
                onOpenNotes={() => setModule("notes")}
              />
            </div>
          </div>
        )}
        {campaigns.length > 0 ? (
          <CampaignCards
            sessions={allSessions}
            title={campaign ? ru.welcome.others : ru.welcome.campaigns}
            onCreate={() => setCreating(true)}
          />
        ) : (
          <p className="muted">{ru.welcome.rightEmpty}</p>
        )}
      </section>
      {creating && <CampaignForm libraryRoot={libraryRoot} onClose={() => setCreating(false)} />}
    </div>
  );
}

function WelcomeTop() {
  const setModule = useAppStore((s) => s.setModule);
  const theme = useThemeStore((s) => s.theme);
  const setPreference = useThemeStore((s) => s.setPreference);
  return (
    <div className="welcome-top">
      <div className="welcome-wordmark">
        <Dices aria-hidden />
        {ru.appName}
      </div>
      <div className="spacer" />
      <IconButton
        icon={Settings}
        label={ru.nav.settings}
        shortcut={MODULE_SHORTCUTS.settings}
        onClick={() => setModule("settings")}
      />
      <IconButton
        icon={theme === "dark" ? Sun : Moon}
        label={theme === "dark" ? ru.theme.toLight : ru.theme.toDark}
        onClick={() => setPreference(theme === "dark" ? "light" : "dark")}
      />
    </div>
  );
}

function Continue({ campaign, sessions }: { campaign: Campaign; sessions: Session[] }) {
  const module = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);
  const openPlan = useSessionsStore((s) => s.openPlan);
  const [error, setError] = useState<string | null>(null);
  const next = nextSession(sessions);

  return (
    <div className="welcome-intro">
      <div className="welcome-eyebrow">{ru.welcome.continue}</div>
      <h1 className="welcome-title">{campaign.name}</h1>
      <p className="welcome-meta">
        {continueSummary(campaign.system, sessions, localDay(new Date()))}
      </p>
      <div className="welcome-actions">
        <Button variant="primary" icon={ArrowRight} onClick={() => setModule(module)}>
          {ru.welcome.open}
        </Button>
        {next && (
          <Button
            icon={NotebookPen}
            onClick={() => {
              setError(null);
              openPlan(next.id)
                .then(() => setModule("notes"))
                .catch((e: unknown) => {
                  console.error(e);
                  setError(ru.sessions.planFailed);
                });
            }}
          >
            {ru.sessions.plan(next.number)}
          </Button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function RecentList({ campaignId }: { campaignId: string }) {
  const setModule = useAppStore((s) => s.setModule);
  const [entries, setEntries] = useState<RecentEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    loadRecent(campaignId)
      .then((list) => live && setEntries(list))
      .catch((e: unknown) => {
        console.error(e);
        if (live) setEntries([]);
      });
    return () => {
      live = false;
    };
  }, [campaignId, version]);

  const open = (entry: RecentEntry) => {
    setError(null);
    showRecent(entry)
      .then(() => setModule(RECENT_SECTIONS[entry.kind]))
      .catch((e: unknown) => {
        console.error(e);
        setError(ru.welcome.openFailed);
        setVersion((v) => v + 1);
      });
  };

  const now = new Date();
  return (
    <div className="welcome-section">
      <h2>{ru.welcome.recent}</h2>
      {entries && entries.length === 0 && <p className="welcome-meta">{ru.welcome.recentEmpty}</p>}
      {entries && entries.length > 0 && (
        <ul className="welcome-recent">
          {entries.map((entry) => {
            const Icon = KIND_ICONS[entry.kind];
            return (
              <li key={`${entry.kind}:${entry.objectId}`}>
                <button type="button" onClick={() => open(entry)}>
                  <Icon aria-hidden />
                  <span className="welcome-recent-text">
                    <span className="welcome-recent-kind">{ru.welcome.kinds[entry.kind]}</span>
                    <span className="welcome-recent-title">{entry.title}</span>
                  </span>
                  <span className="welcome-recent-when">{formatMoment(entry.openedAt, now)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

interface CampaignCardsProps {
  sessions: Session[];
  title: string;
  onCreate: () => void;
}

function CampaignCards({ sessions, title, onCreate }: CampaignCardsProps) {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const activeId = useCampaignStore((s) => s.activeId);
  const setActive = useCampaignStore((s) => s.setActive);
  const setArchived = useCampaignStore((s) => s.setArchived);
  const libraryRoot = useAppStore((s) => s.libraryRoot);
  const [restoring, setRestoring] = useState<Campaign | null>(null);
  const byCampaign = sessionsByCampaign(sessions);
  const today = localDay(new Date());

  return (
    <div className="welcome-section">
      <h2>{title}</h2>
      <div className="welcome-campaigns">
        {otherCampaigns(campaigns, activeId).map((c) => {
          const own = byCampaign.get(c.id) ?? [];
          const summary = campaignCardSummary(c.system, own, today);
          return (
            <button
              key={c.id}
              type="button"
              className={c.archived ? "welcome-campaign finished" : "welcome-campaign"}
              onClick={() => (c.archived ? setRestoring(c) : void setActive(c.id))}
            >
              <CampaignCover name={c.name} coverArtId={c.coverArtId} libraryRoot={libraryRoot} />
              <span className="welcome-campaign-body">
                <span className="welcome-campaign-head">
                  <span className="welcome-campaign-name">{c.name}</span>
                  <span className="badge">
                    {ru.sessions.status[campaignStatus(c.archived, own)]}
                  </span>
                </span>
                <span className="welcome-campaign-summary" title={summary}>
                  {summary}
                </span>
              </span>
            </button>
          );
        })}
        <button type="button" className="welcome-campaign new" onClick={onCreate}>
          <span className="campaign-cover welcome-new-cover">
            <Plus aria-hidden />
          </span>
          <span className="welcome-campaign-body">
            <span className="welcome-campaign-name">{ru.campaign.new}</span>
            <span className="welcome-campaign-summary">{ru.welcome.newCampaignText}</span>
          </span>
        </button>
      </div>
      {restoring && (
        <ConfirmDialog
          title={ru.welcome.restoreTitle}
          text={ru.welcome.restoreText(restoring.name)}
          confirmLabel={ru.welcome.restore}
          onConfirm={async () => {
            await setArchived(restoring.id, false);
            await setActive(restoring.id);
          }}
          onClose={() => setRestoring(null)}
        />
      )}
    </div>
  );
}
