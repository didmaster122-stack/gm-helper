// What the welcome screen shows: summaries of campaigns and the "recent" list. Pure functions.
import type { Campaign } from "../modules/campaigns";
import { lastPlayed, nextSession, type Session } from "../modules/sessions";
import { daysBetween, formatDay, formatDistance } from "../shared/dates";
import type { RecentItem, RecentKind } from "../shared/db";
import { ru } from "../shared/i18n/ru";

export const RECENT_SHOWN = 6;

export interface RecentEntry extends RecentItem {
  title: string;
}

/**
 * The newest objects that still exist, and the journal rows of objects that are gone.
 * `titles` holds the current titles of the existing objects by kind.
 */
export function visibleRecent(
  items: readonly RecentItem[],
  titles: ReadonlyMap<RecentKind, ReadonlyMap<string, string>>,
  limit = RECENT_SHOWN,
): { shown: RecentEntry[]; gone: RecentItem[] } {
  const shown: RecentEntry[] = [];
  const gone: RecentItem[] = [];
  for (const item of items) {
    const title = titles.get(item.kind)?.get(item.objectId);
    if (title === undefined) gone.push(item);
    else if (shown.length < limit) shown.push({ ...item, title });
  }
  return { shown, gone };
}

/** "D&D 5e · сессия 14 была вчера · следующая через 3 дня". */
export function continueSummary(system: string, sessions: readonly Session[], today: string) {
  const t = ru.welcome;
  const last = lastPlayed(sessions);
  const next = nextSession(sessions);
  const parts = [system];
  if (last) {
    parts.push(
      last.date
        ? t.lastWas(last.number, formatDistance(last.date, today))
        : t.lastNumber(last.number),
    );
  } else {
    parts.push(t.noSessions);
  }
  if (next && (last || next.date)) {
    if (!next.date) parts.push(t.nextNoDate);
    else if (daysBetween(today, next.date) < 0) parts.push(t.nextOn(formatDay(next.date, today)));
    else parts.push(t.nextIn(formatDistance(next.date, today)));
  }
  return parts.join(" · ");
}

/** "D&D 5e · Сессия 14 · 19 окт" for a campaign card. */
export function campaignCardSummary(system: string, sessions: readonly Session[], today: string) {
  const last = lastPlayed(sessions);
  const parts = [system];
  if (last) {
    parts.push(ru.sessions.session(last.number));
    if (last.date) parts.push(formatDay(last.date, today));
  }
  return parts.join(" · ");
}

/** Campaigns other than the active one: running ones first, finished ones at the end. */
export function otherCampaigns(
  campaigns: readonly Campaign[],
  activeId: string | null,
): Campaign[] {
  const others = campaigns.filter((c) => c.id !== activeId);
  return [...others.filter((c) => !c.archived), ...others.filter((c) => c.archived)];
}

export function sessionsByCampaign(sessions: readonly Session[]): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = map.get(s.campaignId) ?? [];
    list.push(s);
    map.set(s.campaignId, list);
  }
  return map;
}
