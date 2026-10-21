import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  CornerDownLeft,
  Image,
  Map as MapIcon,
  NotebookPen,
  ScrollText,
  Search,
  Shield,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useCampaignStore } from "../modules/campaigns";
import { formatMoment } from "../shared/dates";
import { ru } from "../shared/i18n/ru";
import {
  buildSearchIndex,
  searchAll,
  type SearchIndex,
  type SearchKind,
} from "../shared/search/global";
import { NAV_GROUPS } from "./nav";
import { loadRecent, RECENT_SECTIONS, showRecent } from "./recent";
import {
  appCommands,
  loadSearchRecords,
  openSearchRecord,
  SEARCH_SECTIONS,
  type Command,
} from "./search";
import { useAppStore } from "./store";

const KIND_ICONS: Record<SearchKind, LucideIcon> = {
  command: CornerDownLeft,
  character: UserRound,
  faction: Shield,
  event: ScrollText,
  note: NotebookPen,
  battlemap: MapIcon,
  art: Image,
};

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
const NAV_ICONS = new Map(NAV_ITEMS.map((i) => [`section:${i.id}`, i.icon]));
const NAV_LABELS = new Map(NAV_ITEMS.map((i) => [i.id, i.label]));

interface Row {
  key: string;
  icon: LucideIcon;
  title: string;
  /** Folder of an art, role of a character. */
  detail: string;
  /** Section (and campaign, for objects of another one) or the time it was opened. */
  meta: string;
  open: () => void | Promise<void>;
}

interface RowGroup {
  title: string;
  more: number;
  rows: Row[];
}

/** Ctrl+K window: one line searching sections, commands and objects of every campaign. */
export function SearchDialog({
  onClose,
  onOpenHelp,
}: {
  onClose: () => void;
  onOpenHelp: () => void;
}) {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const activeId = useCampaignStore((s) => s.activeId);
  const [commands] = useState<Command[]>(() => appCommands(onOpenHelp));
  const [index, setIndex] = useState<SearchIndex | null>(null);
  // Without a campaign there is nothing recent to load.
  const [recent, setRecent] = useState<Row[] | null>(() => (activeId ? null : []));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadSearchRecords(commands)
      .then((records) => live && setIndex(buildSearchIndex(records)))
      .catch((e: unknown) => {
        console.error(e);
        if (live) {
          setIndex(buildSearchIndex([]));
          setError(ru.search.loadFailed);
        }
      });
    return () => {
      live = false;
    };
  }, [commands]);

  useEffect(() => {
    if (!activeId) return;
    let live = true;
    const now = new Date();
    loadRecent(activeId)
      .then((entries) => {
        if (!live) return;
        setRecent(
          entries.map((entry) => ({
            key: `${entry.kind}:${entry.objectId}`,
            icon: KIND_ICONS[entry.kind],
            title: entry.title,
            detail: ru.welcome.kinds[entry.kind],
            meta: formatMoment(entry.openedAt, now),
            open: async () => {
              await showRecent(entry);
              useAppStore.getState().setModule(RECENT_SECTIONS[entry.kind]);
            },
          })),
        );
      })
      .catch((e: unknown) => {
        console.error(e);
        if (live) setRecent([]);
      });
    return () => {
      live = false;
    };
  }, [activeId]);

  const groups = useMemo((): RowGroup[] => {
    if (deferredQuery.trim() === "") {
      return recent && recent.length > 0
        ? [{ title: ru.search.recent, more: 0, rows: recent }]
        : [];
    }
    if (!index) return [];
    const names = new Map(campaigns.map((c) => [c.id, c.name]));
    const byId = new Map(commands.map((c) => [c.id, c]));
    return searchAll(index, deferredQuery, activeId).map((group) => ({
      title: ru.search.groups[group.kind],
      more: group.total - group.hits.length,
      rows: group.hits.map(({ record, own }): Row => {
        if (record.kind === "command") {
          const command = byId.get(record.id);
          return {
            key: `command:${record.id}`,
            icon: NAV_ICONS.get(record.id) ?? KIND_ICONS.command,
            title: record.title,
            detail: "",
            meta: command?.section ?? "",
            open: () => command?.run(),
          };
        }
        const section = SEARCH_SECTIONS[record.kind];
        const campaign = !own && record.campaignId ? names.get(record.campaignId) : undefined;
        return {
          key: `${record.kind}:${record.id}`,
          icon: KIND_ICONS[record.kind],
          title: record.title,
          detail: record.detail ?? "",
          meta: [NAV_LABELS.get(section), campaign].filter(Boolean).join(" · "),
          open: () => openSearchRecord(record),
        };
      }),
    }));
  }, [deferredQuery, index, recent, campaigns, commands, activeId]);

  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  const current = Math.min(selected, Math.max(rows.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector(`[data-row="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current, rows]);

  const open = (row: Row | undefined) => {
    if (!row) return;
    setError(null);
    Promise.resolve(row.open())
      .then(onClose)
      .catch((e: unknown) => {
        console.error(e);
        setError(ru.search.openFailed);
      });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSelected((current + step + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(rows[current]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const searching = deferredQuery.trim() !== "";
  const offsets = groups.map((_, gi) =>
    groups.slice(0, gi).reduce((sum, g) => sum + g.rows.length, 0),
  );
  return (
    <div className="modal-backdrop search-backdrop" onMouseDown={onClose}>
      <div
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={ru.search.open}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <label className="search-field">
          <Search aria-hidden />
          <input
            autoFocus
            value={query}
            placeholder={ru.search.placeholder}
            aria-label={ru.search.open}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
          />
        </label>
        <div className="search-results" ref={listRef} role="listbox">
          {groups.map((group, gi) => (
            <section key={group.title} className="search-group">
              <h3>
                {group.title}
                {group.more > 0 && <span>{ru.search.more(group.more)}</span>}
              </h3>
              {group.rows.map((row, ri) => {
                const i = (offsets[gi] ?? 0) + ri;
                const Icon = row.icon;
                return (
                  <button
                    key={row.key}
                    type="button"
                    role="option"
                    aria-selected={i === current}
                    data-row={i}
                    className={i === current ? "search-row selected" : "search-row"}
                    onMouseMove={() => i !== current && setSelected(i)}
                    onClick={() => open(row)}
                  >
                    <Icon aria-hidden />
                    <span className="search-row-title">{row.title}</span>
                    {row.detail && <span className="search-row-detail">{row.detail}</span>}
                    <span className="search-row-meta">{row.meta}</span>
                  </button>
                );
              })}
            </section>
          ))}
          {searching && index && rows.length === 0 && (
            <p className="search-empty">{ru.search.nothing}</p>
          )}
          {!searching && recent && recent.length === 0 && (
            <p className="search-empty">{ru.search.recentEmpty}</p>
          )}
        </div>
        {error && <p className="error search-error">{error}</p>}
        <footer className="search-hint">{ru.search.hint}</footer>
      </div>
    </div>
  );
}
