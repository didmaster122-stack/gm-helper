import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  useConnection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { memo } from "react";
import { ru } from "../../shared/i18n/ru";
import type { CharacterKind, CharacterStatus, LineStyle } from "./domain/types";
import { PortraitView } from "./portraits";
import { useRelationsStore } from "./store";
import type { PortraitImage } from "./usePortraitResolver";

export type CharacterNodeData = {
  name: string;
  role: string;
  kind: CharacterKind;
  status: CharacterStatus;
  image: PortraitImage;
  /** Colour of the main faction, for the ring around the picture. */
  ring: string | null;
  /** Other factions of the character, shown as small badges. */
  badges: { id: string; name: string; color: string }[];
  /** Relations with the main faction (not drawn as arrows), when they are to be shown. */
  factionRelations: {
    id: string;
    color: string;
    arrow: string;
    text: string;
    selected: boolean;
  }[];
};

export type FactionNodeData = {
  name: string;
  color: string;
  image: PortraitImage;
  empty: boolean;
};

export type RelationEdgeData = {
  d: string;
  labelX: number;
  labelY: number;
  label: string;
  color: string;
  lineStyle: LineStyle;
};

export type CharacterNode = Node<CharacterNodeData, "character">;
export type FactionNode = Node<FactionNodeData, "faction">;
export type GraphNode = CharacterNode | FactionNode;
export type RelationEdge = Edge<RelationEdgeData, "relation">;

/**
 * Edges need a target handle on every node. While a connection is being drawn
 * it grows to cover the whole node, so the line can be dropped anywhere on it.
 */
function TargetHandle({ nodeId }: { nodeId: string }) {
  const connection = useConnection();
  const active = connection.inProgress && connection.fromNode.id !== nodeId;
  return (
    <Handle
      type="target"
      position={Position.Left}
      isConnectableStart={false}
      className={active ? "graph-target active" : "graph-target"}
    />
  );
}

function SourceHandle({ className }: { className: string }) {
  return (
    <Handle
      type="source"
      position={Position.Right}
      className={`graph-source ${className}`}
      title={ru.relations.connectHint}
    />
  );
}

export const CharacterNodeView = memo(function CharacterNodeView({
  id,
  data,
  selected,
}: NodeProps<CharacterNode>) {
  const classes = ["graph-character", `status-${data.status}`, `kind-${data.kind}`];
  if (selected) classes.push("selected");
  return (
    <div className={classes.join(" ")}>
      <div className="graph-avatar" style={data.ring ? { borderColor: data.ring } : undefined}>
        <PortraitView image={data.image} name={data.name} />
        {data.status !== "alive" && (
          <span className="graph-status" title={ru.relations.statuses[data.status]}>
            {data.status === "dead" ? "✝" : "?"}
          </span>
        )}
        {data.kind === "pc" && <span className="graph-pc">{ru.relations.kinds.pc}</span>}
        <SourceHandle className="on-avatar" />
      </div>
      <div className="graph-name">{data.name}</div>
      {data.role && <div className="graph-role">{data.role}</div>}
      {data.badges.length > 0 && (
        <div className="graph-badges">
          {data.badges.map((b) => (
            <span key={b.id} className="graph-badge" style={{ background: b.color }} title={b.name}>
              {b.name.trim()[0]?.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      {data.factionRelations.length > 0 && (
        <div className="graph-inner-relations">
          {data.factionRelations.map((r) => (
            <button
              key={r.id}
              type="button"
              className={r.selected ? "graph-inner-relation selected" : "graph-inner-relation"}
              style={{ borderColor: r.color }}
              onClick={(e) => {
                // Opens the relation card instead of selecting the character again.
                e.stopPropagation();
                useRelationsStore.getState().select({ kind: "relation", id: r.id });
              }}
            >
              <span className="type-dot" style={{ background: r.color }} />
              <span className="muted">{r.arrow}</span>
              {r.text}
            </button>
          ))}
        </div>
      )}
      <TargetHandle nodeId={id} />
    </div>
  );
});

export const FactionNodeView = memo(function FactionNodeView({
  id,
  data,
  selected,
}: NodeProps<FactionNode>) {
  return (
    <div
      className={selected ? "graph-faction selected" : "graph-faction"}
      style={{ borderColor: data.color, background: `${data.color}14` }}
    >
      <div className="graph-faction-header" style={{ background: `${data.color}33` }}>
        {data.image.kind !== "none" && (
          <span className="graph-emblem">
            <PortraitView image={data.image} name={data.name} />
          </span>
        )}
        <span className="graph-faction-name">{data.name}</span>
        <SourceHandle className="on-header" />
      </div>
      <TargetHandle nodeId={id} />
    </div>
  );
});

const DASH: Record<LineStyle, string | undefined> = {
  solid: undefined,
  dashed: "8 5",
  dotted: "1 5",
};

export const RelationEdgeView = memo(function RelationEdgeView({
  id,
  data,
  selected,
  markerEnd,
  markerStart,
}: EdgeProps<RelationEdge>) {
  if (!data) return null;
  return (
    <>
      <BaseEdge
        id={id}
        path={data.d}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={14}
        style={{
          stroke: data.color,
          strokeWidth: selected ? 3.5 : 2,
          strokeDasharray: DASH[data.lineStyle],
          strokeLinecap: data.lineStyle === "dotted" ? "round" : undefined,
        }}
      />
      {data.label && (
        <EdgeLabelRenderer>
          <div
            className={selected ? "graph-edge-label selected" : "graph-edge-label"}
            style={{
              transform: `translate(-50%, -50%) translate(${data.labelX}px, ${data.labelY}px)`,
              borderColor: data.color,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
