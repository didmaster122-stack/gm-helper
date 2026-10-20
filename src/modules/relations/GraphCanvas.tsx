import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { useTheme, useThemeColor } from "../../shared/ui";
import { splitInnerRelations, visibleGraph } from "./domain/filter";
import {
  avatarCenter,
  characterShape,
  CHARACTER_H,
  CHARACTER_W,
  factionFrames,
  parallelOffsets,
  relationPath,
  type Shape,
} from "./domain/geometry";
import { moveNodes, type Point } from "./domain/graph";
import type { Character } from "./domain/types";
import type { GraphNode, RelationEdge } from "./GraphNodes";
import { edgeTypes, nodeTypes } from "./graphTypes";
import { usePortraitResolver } from "./usePortraitResolver";
import { typeLookup, useRelationTypeStore } from "./relationTypeStore";
import { useGraph, useRelationsStore } from "./store";

interface DragState {
  nodeId: string;
  origin: Point;
  /** Faction members moved together with their frame, with their positions at the start. */
  members: Map<string, Point>;
}

/** New positions of what a drag moves: the node itself, or the members of a faction frame. */
function dragPositions(d: DragState, position: Point): Map<string, Point> {
  if (d.members.size === 0) return new Map([[d.nodeId, { x: position.x, y: position.y }]]);
  const dx = position.x - d.origin.x;
  const dy = position.y - d.origin.y;
  return new Map([...d.members].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]));
}

interface GraphCanvasProps {
  libraryRoot: string;
  /** A connection was drawn from one node to another. */
  onConnect: (fromId: string, toId: string) => void;
}

export function GraphCanvas({ libraryRoot, onConnect }: GraphCanvasProps) {
  const theme = useTheme();
  const muted = useThemeColor("--text-subtle");
  const graph = useGraph();
  const filter = useRelationsStore((s) => s.filter);
  const selection = useRelationsStore((s) => s.selection);
  const focusId = useRelationsStore((s) => s.focusId);
  const select = useRelationsStore((s) => s.select);
  const setFocus = useRelationsStore((s) => s.setFocus);
  const edit = useRelationsStore((s) => s.edit);
  const types = useRelationTypeStore((s) => s.types);
  const resolve = usePortraitResolver(libraryRoot);
  const flow = useReactFlow<GraphNode, RelationEdge>();
  // A node to centre on wins over fitting the whole graph.
  const [fitOnInit] = useState(() => useRelationsStore.getState().focusId === null);

  // Positions of nodes being dragged; saved to the graph when the drag ends.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Point>>(new Map());
  const drag = useRef<DragState | null>(null);

  const visible = useMemo(() => visibleGraph(graph, filter), [graph, filter]);

  const characters = useMemo(
    () =>
      graph.characters
        .filter((c) => visible.characters.has(c.id))
        .map((c): Character => {
          const p = overrides.get(c.id);
          return p ? { ...c, x: p.x, y: p.y } : c;
        }),
    [graph.characters, visible, overrides],
  );
  const factions = useMemo(
    () =>
      graph.factions
        .filter((f) => visible.factions.has(f.id))
        .map((f) => {
          const p = overrides.get(f.id);
          return p ? { ...f, x: p.x, y: p.y } : f;
        }),
    [graph.factions, visible, overrides],
  );
  const frames = useMemo(() => factionFrames(factions, characters), [factions, characters]);

  // Relations of a character with the faction it is drawn in are labels, not arrows.
  const split = useMemo(
    () =>
      splitInnerRelations(
        graph.relations.filter((r) => visible.relations.has(r.id)),
        characters,
      ),
    [graph.relations, visible, characters],
  );

  const nodes = useMemo<GraphNode[]>(() => {
    const typeOf = typeLookup(types);

    const factionById = new Map(graph.factions.map((f) => [f.id, f]));
    const isSelected = (id: string) => selection?.id === id;
    const result: GraphNode[] = [];
    for (const f of factions) {
      const frame = frames.get(f.id);
      if (!frame) continue;
      result.push({
        id: f.id,
        type: "faction",
        position: { x: frame.x, y: frame.y },
        width: frame.width,
        height: frame.height,
        // Sizes are known in advance; React Flow needs them to drag a node.
        measured: { width: frame.width, height: frame.height },
        selected: isSelected(f.id),
        dragHandle: ".graph-faction-header",
        data: {
          name: f.name,
          color: f.color,
          image: resolve(f),
          empty: !characters.some((c) => c.factionIds[0] === f.id),
        },
      });
    }
    for (const c of characters) {
      const main = c.factionIds[0] ? factionById.get(c.factionIds[0]) : undefined;
      const inner = split.inner.get(c.id) ?? [];
      // Labels of relations with the own faction: while the character or one of them is selected.
      const showInner = isSelected(c.id) || inner.some((r) => isSelected(r.id));
      result.push({
        id: c.id,
        type: "character",
        position: { x: c.x, y: c.y },
        width: CHARACTER_W,
        height: CHARACTER_H,
        measured: { width: CHARACTER_W, height: CHARACTER_H },
        selected: isSelected(c.id),
        // Above neighbouring nodes, so the labels are not covered.
        zIndex: showInner ? 10 : 0,
        data: {
          name: c.name,
          role: c.role,
          kind: c.kind,
          status: c.status,
          image: resolve(c),
          ring: main?.color ?? null,
          badges: c.factionIds.slice(1).flatMap((id) => {
            const f = factionById.get(id);
            return f ? [{ id: f.id, name: f.name, color: f.color }] : [];
          }),
          factionRelations: showInner
            ? inner.map((r) => {
                const type = typeOf(r.typeId);
                const t = ru.relations.relation;
                return {
                  id: r.id,
                  color: type.color,
                  arrow: r.mutual ? t.both : r.fromId === c.id ? t.arrow : t.incoming,
                  text: r.label ? `${type.name} · ${r.label}` : type.name,
                  selected: isSelected(r.id),
                };
              })
            : [],
        },
      });
    }
    return result;
  }, [graph.factions, factions, characters, frames, selection, resolve, split, types]);

  const edges = useMemo<RelationEdge[]>(() => {
    const shapes = new Map<string, Shape>();
    for (const c of characters) shapes.set(c.id, characterShape(c));
    for (const [id, rect] of frames) shapes.set(id, { kind: "rect", rect });
    const typeOf = typeLookup(types);
    const offsets = parallelOffsets(split.drawn);
    return split.drawn.flatMap((r): RelationEdge[] => {
      const from = shapes.get(r.fromId);
      const to = shapes.get(r.toId);
      if (!from || !to) return [];
      const type = typeOf(r.typeId);
      const path = relationPath(r.fromId, from, r.toId, to, offsets.get(r.id) ?? 0);
      const marker = { type: MarkerType.ArrowClosed, color: type.color, width: 16, height: 16 };
      return [
        {
          id: r.id,
          type: "relation",
          source: r.fromId,
          target: r.toId,
          selected: selection?.id === r.id,
          markerEnd: marker,
          markerStart: r.mutual ? marker : undefined,
          data: {
            d: path.d,
            labelX: path.label.x,
            labelY: path.label.y,
            label: r.label,
            color: type.color,
            lineStyle: type.lineStyle,
          },
        },
      ];
    });
  }, [split, characters, frames, types, selection]);

  // Centre on a node asked for by search or by "Create character" in the library.
  useEffect(() => {
    if (!focusId) return;
    const c = characters.find((x) => x.id === focusId);
    const frame = frames.get(focusId);
    const point = c
      ? avatarCenter(c)
      : frame
        ? { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }
        : null;
    setFocus(null);
    if (point) {
      void flow.setCenter(point.x, point.y, {
        zoom: Math.max(flow.getZoom(), 1),
        duration: 400,
      });
    }
  }, [focusId, characters, frames, flow, setFocus]);

  const onNodeDragStart: OnNodeDrag<GraphNode> = useCallback(
    (_, node) => {
      const members = new Map<string, Point>();
      if (node.type === "faction") {
        for (const c of characters) {
          if (c.factionIds[0] === node.id) members.set(c.id, { x: c.x, y: c.y });
        }
      }
      drag.current = { nodeId: node.id, origin: node.position, members };
      select({ kind: node.type, id: node.id });
    },
    [characters, select],
  );

  const onNodeDrag: OnNodeDrag<GraphNode> = useCallback((_, node) => {
    if (drag.current?.nodeId === node.id) setOverrides(dragPositions(drag.current, node.position));
  }, []);

  const onNodeDragStop: OnNodeDrag<GraphNode> = useCallback(
    (_, node) => {
      const d = drag.current;
      drag.current = null;
      setOverrides(new Map());
      if (d?.nodeId !== node.id) return;
      const positions = dragPositions(d, node.position);
      for (const [id, p] of positions)
        positions.set(id, { x: Math.round(p.x), y: Math.round(p.y) });
      edit((g, now) => moveNodes(g, positions, now));
    },
    [edit],
  );

  const onNodeClick: NodeMouseHandler<GraphNode> = useCallback(
    (_, node) => select({ kind: node.type, id: node.id }),
    [select],
  );

  const handleConnect = useCallback(
    (c: Connection) => {
      if (c.source !== c.target) onConnect(c.source, c.target);
    },
    [onConnect],
  );

  return (
    <ReactFlow<GraphNode, RelationEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onNodeClick={onNodeClick}
      onEdgeClick={(_, edge) => select({ kind: "relation", id: edge.id })}
      onPaneClick={() => select(null)}
      onConnect={handleConnect}
      isValidConnection={(c) => c.source !== c.target}
      connectionMode={ConnectionMode.Strict}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      elevateNodesOnSelect={false}
      elevateEdgesOnSelect
      minZoom={0.1}
      maxZoom={2.5}
      fitView={fitOnInit}
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      colorMode={theme}
    >
      <Background gap={24} />
      <Controls showInteractive={false} />
      <MiniMap<GraphNode>
        pannable
        zoomable
        nodeColor={(n) => (n.type === "faction" ? `${n.data.color}55` : (n.data.ring ?? muted))}
        nodeStrokeColor={(n) => (n.type === "faction" ? n.data.color : "transparent")}
      />
    </ReactFlow>
  );
}
