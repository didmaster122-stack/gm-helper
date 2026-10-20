import { getNodesBounds, useReactFlow } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { pickSavePath, writeChosenFile } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { isFiltered, noFilter, searchGraph, visibleGraph, type GraphFilter } from "./domain/filter";
import { moveNodes } from "./domain/graph";
import { forceLayout } from "./domain/layout";
import { renderGraphPng } from "./exportPng";
import type { GraphNode, RelationEdge } from "./GraphNodes";
import { useRelationTypeStore } from "./relationTypeStore";
import { useGraph, useRelationsStore } from "./store";

type Notice = { kind: "info" | "error"; text: string } | null;

interface GraphToolbarProps {
  campaignName: string;
  onNewCharacter: () => void;
  onNewFaction: () => void;
  /** Element containing the React Flow canvas (for PNG export). */
  canvas: () => HTMLElement | null;
}

export function GraphToolbar({
  campaignName,
  onNewCharacter,
  onNewFaction,
  canvas,
}: GraphToolbarProps) {
  const t = ru.relations;
  const history = useRelationsStore((s) => s.history);
  const undo = useRelationsStore((s) => s.undo);
  const redo = useRelationsStore((s) => s.redo);
  const edit = useRelationsStore((s) => s.edit);
  const flow = useReactFlow<GraphNode, RelationEdge>();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  function layout() {
    edit((g, now) => moveNodes(g, forceLayout(g), now));
    // Fit after React Flow has the new positions.
    requestAnimationFrame(() => void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }));
  }

  async function exportPng() {
    setNotice(null);
    const nodes = flow.getNodes();
    const viewport = canvas()?.querySelector<HTMLElement>(".react-flow__viewport");
    if (nodes.length === 0 || !viewport) {
      setNotice({ kind: "info", text: t.exportEmpty });
      return;
    }
    setBusy(true);
    try {
      const bytes = await renderGraphPng(viewport, getNodesBounds(nodes), "#16171c");
      const path = await pickSavePath(t.exportTitle, `${campaignName} — ${ru.nav.relations}.png`, [
        { name: t.exportFilter, extensions: ["png"] },
      ]);
      if (path) {
        await writeChosenFile(path, bytes);
        setNotice({ kind: "info", text: t.exportDone(path) });
      }
    } catch (error) {
      setNotice({ kind: "error", text: t.exportFailed(String(error)) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="graph-toolbar">
      <button type="button" onClick={onNewCharacter}>
        + {t.newCharacter}
      </button>
      <button type="button" onClick={onNewFaction}>
        + {t.newFaction}
      </button>
      <GraphSearch />
      <FilterMenu />
      <span className="spacer" />
      {notice && (
        <span
          className={notice.kind === "error" ? "error graph-notice" : "muted graph-notice"}
          onClick={() => setNotice(null)}
        >
          {notice.text}
        </span>
      )}
      <button type="button" onClick={layout} title={t.autoLayoutHint}>
        {t.autoLayout}
      </button>
      <div className="toolbar-group">
        <button type="button" onClick={undo} disabled={history.past.length === 0} title={t.undo}>
          ↶
        </button>
        <button type="button" onClick={redo} disabled={history.future.length === 0} title={t.redo}>
          ↷
        </button>
      </div>
      <button type="button" onClick={() => void exportPng()} disabled={busy} title={t.exportTitle}>
        {t.exportPng}
      </button>
    </div>
  );
}

function GraphSearch() {
  const graph = useGraph();
  const filter = useRelationsStore((s) => s.filter);
  const setFilter = useRelationsStore((s) => s.setFilter);
  const select = useRelationsStore((s) => s.select);
  const setFocus = useRelationsStore((s) => s.setFocus);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => searchGraph(graph, query), [graph, query]);

  function choose(index: number) {
    const hit = hits[index];
    if (!hit) return;
    // A hidden node cannot be shown: drop the filters.
    const visible = visibleGraph(graph, filter);
    const shown = hit.kind === "character" ? visible.characters : visible.factions;
    if (!shown.has(hit.id)) setFilter(noFilter);
    select({ kind: hit.kind, id: hit.id });
    setFocus(hit.id);
    setOpen(false);
  }

  return (
    <div className="graph-search">
      <input
        type="search"
        placeholder={ru.relations.searchPlaceholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
          else if (e.key === "Enter") choose(active);
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && query.trim() !== "" && (
        <ul className="graph-search-results">
          {hits.length === 0 ? (
            <li className="muted">{ru.relations.noMatches}</li>
          ) : (
            hits.map((h, i) => (
              <li key={h.id}>
                <button
                  type="button"
                  className={i === active ? "active" : ""}
                  // mousedown fires before the input loses focus and closes the list.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(i);
                  }}
                >
                  {h.name}
                  {h.kind === "faction" && (
                    <small className="muted"> · {ru.relations.newFaction}</small>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function toggle(set: ReadonlySet<string> | null, id: string, all: readonly string[]): Set<string> {
  const next = new Set(set ?? all);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function FilterMenu() {
  const graph = useGraph();
  const filter = useRelationsStore((s) => s.filter);
  const setFilter = useRelationsStore((s) => s.setFilter);
  const types = useRelationTypeStore((s) => s.types);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = ru.relations.filter;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const update = (patch: Partial<GraphFilter>) => setFilter({ ...filter, ...patch });
  const allTypes = types.map((x) => x.id);
  const active =
    Number(filter.hideDead) +
    Number(filter.onlyPcs) +
    Number(filter.factionIds !== null) +
    Number(filter.typeIds !== null);

  return (
    <div className="graph-filter" ref={ref}>
      <button
        type="button"
        className={isFiltered(filter) ? "active" : ""}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {active > 0 ? ru.relations.filtersActive(active) : ru.relations.filters} ▾
      </button>
      {open && (
        <div className="graph-filter-menu">
          <label className="check">
            <input
              type="checkbox"
              checked={filter.hideDead}
              onChange={(e) => update({ hideDead: e.target.checked })}
            />
            <span>{t.hideDead}</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={filter.onlyPcs}
              onChange={(e) => update({ onlyPcs: e.target.checked })}
            />
            <span>{t.onlyPcs}</span>
          </label>

          <h4>{t.factions}</h4>
          {graph.factions.length === 0 ? (
            <p className="muted">{t.noFactions}</p>
          ) : (
            <>
              {graph.factions.map((f) => (
                <label key={f.id} className="check">
                  <input
                    type="checkbox"
                    checked={filter.factionIds?.has(f.id) ?? false}
                    onChange={() => {
                      const next = new Set(filter.factionIds ?? []);
                      if (next.has(f.id)) next.delete(f.id);
                      else next.add(f.id);
                      update({ factionIds: next.size > 0 ? next : null });
                    }}
                  />
                  <span className="type-dot" style={{ background: f.color }} />
                  <span>{f.name}</span>
                </label>
              ))}
              <small className="hint">{t.factionsHint}</small>
            </>
          )}

          <h4>{t.types}</h4>
          {types.map((x) => (
            <label key={x.id} className="check">
              <input
                type="checkbox"
                checked={filter.typeIds?.has(x.id) ?? true}
                onChange={() => {
                  const next = toggle(filter.typeIds, x.id, allTypes);
                  update({ typeIds: next.size === allTypes.length ? null : next });
                }}
              />
              <span className="type-dot" style={{ background: x.color }} />
              <span>{x.name}</span>
            </label>
          ))}

          <button type="button" onClick={() => setFilter(noFilter)} disabled={!isFiltered(filter)}>
            {t.reset}
          </button>
        </div>
      )}
    </div>
  );
}
