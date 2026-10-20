import "@xyflow/react/dist/style.css";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, Funnel, Waypoints, X } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { EmptyState, IconButton } from "../../shared/ui";
import type { Campaign } from "../campaigns";
import { useLibraryStore } from "../library";
import { CharacterCard } from "./CharacterCard";
import { removeRelation } from "./domain/graph";
import { visibleGraph } from "./domain/filter";
import { CHARACTER_H, CHARACTER_W } from "./domain/geometry";
import { FactionCard } from "./FactionCard";
import { GraphCanvas } from "./GraphCanvas";
import { GraphToolbar } from "./GraphToolbar";
import { RelationCard } from "./RelationCard";
import { NewCharacterDialog, NewFactionDialog, NewRelationDialog } from "./RelationDialogs";
import { useRelationTypeStore } from "./relationTypeStore";
import { useGraph, useRelationsStore } from "./store";

interface RelationsScreenProps {
  campaign: Campaign;
  libraryRoot: string;
  /** Extra section of a character card (the character's events on the timeline). */
  characterExtras?: (characterId: string) => ReactNode;
}

export function RelationsScreen(props: RelationsScreenProps) {
  const { campaign, libraryRoot } = props;
  const load = useRelationsStore((s) => s.load);
  const status = useRelationsStore((s) => s.status);
  const loadedFor = useRelationsStore((s) => s.campaignId);
  const loadTypes = useRelationTypeStore((s) => s.load);
  const openLibrary = useLibraryStore((s) => s.open);

  useEffect(() => {
    void load(campaign.id);
  }, [load, campaign.id]);
  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);
  useEffect(() => {
    void openLibrary(libraryRoot);
  }, [openLibrary, libraryRoot]);

  if (status === "error") {
    return (
      <EmptyState
        title={ru.relations.loadFailed}
        action={
          <button type="button" onClick={() => void load(campaign.id, true)}>
            {ru.common.retry}
          </button>
        }
      />
    );
  }
  if (status !== "ready" || loadedFor !== campaign.id) {
    return <div className="center muted">{ru.common.loading}</div>;
  }

  return (
    <ReactFlowProvider key={campaign.id}>
      <RelationsView {...props} />
    </ReactFlowProvider>
  );
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

type Dialog =
  | { kind: "character" }
  | { kind: "faction" }
  | { kind: "relation"; from: string; to: string }
  | null;

function RelationsView({ campaign, libraryRoot, characterExtras }: RelationsScreenProps) {
  const graph = useGraph();
  const selection = useRelationsStore((s) => s.selection);
  const filter = useRelationsStore((s) => s.filter);
  const saveError = useRelationsStore((s) => s.saveError);
  const clearSaveError = useRelationsStore((s) => s.clearSaveError);
  const flow = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector(".modal-backdrop")) return;
      const s = useRelationsStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      // e.code is layout-independent, so shortcuts also work with the Russian layout.
      if (ctrl && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (ctrl && e.code === "KeyY") {
        e.preventDefault();
        s.redo();
      } else if (e.key === "Delete" && s.selection?.kind === "relation") {
        const id = s.selection.id;
        s.edit((g) => removeRelation(g, id));
        s.select(null);
      } else if (e.key === "Escape") {
        s.select(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** Top-left position that puts a new character in the middle of the view. */
  const viewCenter = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const p = flow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    return { x: p.x - CHARACTER_W / 2, y: p.y - CHARACTER_H / 2 };
  }, [flow]);

  const onConnect = useCallback(
    (from: string, to: string) => setDialog({ kind: "relation", from, to }),
    [],
  );

  const visible = visibleGraph(graph, filter);
  const empty = graph.characters.length === 0 && graph.factions.length === 0;
  const allHidden = !empty && visible.characters.size === 0 && visible.factions.size === 0;

  let card = null;
  if (selection?.kind === "character") {
    const c = graph.characters.find((x) => x.id === selection.id);
    if (c) {
      card = (
        <CharacterCard
          character={c}
          graph={graph}
          libraryRoot={libraryRoot}
          preferredSystem={campaign.system}
          extras={characterExtras?.(c.id)}
        />
      );
    }
  } else if (selection?.kind === "faction") {
    const f = graph.factions.find((x) => x.id === selection.id);
    if (f) {
      card = (
        <FactionCard
          faction={f}
          graph={graph}
          libraryRoot={libraryRoot}
          preferredSystem={campaign.system}
        />
      );
    }
  } else if (selection?.kind === "relation") {
    const r = graph.relations.find((x) => x.id === selection.id);
    if (r) card = <RelationCard relation={r} graph={graph} />;
  }

  return (
    <div className="relations">
      <GraphToolbar
        campaignName={campaign.name}
        onNewCharacter={() => setDialog({ kind: "character" })}
        onNewFaction={() => setDialog({ kind: "faction" })}
        canvas={() => canvasRef.current}
      />
      {saveError && (
        <div className="notice error">
          <CircleAlert aria-hidden />
          <span>{ru.relations.saveFailed(saveError)}</span>
          <IconButton icon={X} size="sm" label={ru.common.close} onClick={clearSaveError} />
        </div>
      )}
      <div className="relations-body">
        <div className="relations-canvas" ref={canvasRef}>
          <GraphCanvas libraryRoot={libraryRoot} onConnect={onConnect} />
          {(empty || allHidden) && (
            <div className="graph-empty">
              <EmptyState
                icon={empty ? Waypoints : Funnel}
                title={empty ? ru.relations.emptyTitle : ru.relations.hiddenByFilter}
                text={empty ? ru.relations.emptyText : undefined}
              />
            </div>
          )}
        </div>
        {card && (
          <aside className="side-panel graph-side">
            <IconButton
              icon={X}
              className="panel-close"
              label={ru.common.close}
              shortcut="Esc"
              onClick={() => useRelationsStore.getState().select(null)}
            />
            {card}
          </aside>
        )}
      </div>

      {dialog?.kind === "character" && (
        <NewCharacterDialog
          campaignId={campaign.id}
          position={viewCenter}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "faction" && (
        <NewFactionDialog
          campaignId={campaign.id}
          position={viewCenter}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "relation" && (
        <NewRelationDialog
          graph={graph}
          fromId={dialog.from}
          toId={dialog.to}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
