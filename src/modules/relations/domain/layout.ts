// Automatic arrangement of the graph (run on demand, spec §4.4).
import { CHARACTER_H, CHARACTER_W, EMPTY_FRAME_H, EMPTY_FRAME_W, factionFrames } from "./geometry";
import { moveNodes, type Point } from "./graph";
import type { RelationGraph } from "./types";

/**
 * Stores the current frame position of factions that have members, so that a
 * faction keeps its place when its last member leaves.
 */
export function syncFactionPositions(graph: RelationGraph, now: string): RelationGraph {
  const frames = factionFrames(graph.factions, graph.characters);
  const withMembers = new Set(graph.characters.flatMap((c) => c.factionIds.slice(0, 1)));
  const positions = new Map<string, Point>();
  for (const f of graph.factions) {
    const frame = frames.get(f.id);
    if (frame && withMembers.has(f.id)) positions.set(f.id, { x: frame.x, y: frame.y });
  }
  return moveNodes(graph, positions, now);
}

interface LayoutNode {
  id: string;
  /** Centre. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Main faction; members of one faction pull together. */
  group: string | null;
}

export interface LayoutOptions {
  iterations?: number;
  /** Preferred distance between connected nodes. */
  distance?: number;
}

/**
 * Force-directed layout (Fruchterman–Reingold): relations pull nodes together,
 * all nodes push each other apart, members of a faction are kept close and away
 * from other factions. Deterministic. Returns new top-left positions of all
 * characters and of factions without members; the arrangement keeps the old
 * top-left corner of the whole graph.
 */
export function forceLayout(graph: RelationGraph, options: LayoutOptions = {}): Map<string, Point> {
  const iterations = options.iterations ?? 400;
  const L = options.distance ?? 240;

  const withMembers = new Set(graph.characters.flatMap((c) => c.factionIds.slice(0, 1)));
  const nodes: LayoutNode[] = [
    ...graph.characters.map((c) => ({
      id: c.id,
      x: c.x + CHARACTER_W / 2,
      y: c.y + CHARACTER_H / 2,
      width: CHARACTER_W,
      height: CHARACTER_H,
      group: c.factionIds[0] ?? null,
    })),
    ...graph.factions
      .filter((f) => !withMembers.has(f.id))
      .map((f) => ({
        id: f.id,
        x: f.x + EMPTY_FRAME_W / 2,
        y: f.y + EMPTY_FRAME_H / 2,
        width: EMPTY_FRAME_W,
        height: EMPTY_FRAME_H,
        group: null,
      })),
  ];
  const result = new Map<string, Point>();
  if (nodes.length === 0) return result;

  const origin = {
    x: Math.min(...nodes.map((n) => n.x - n.width / 2)),
    y: Math.min(...nodes.map((n) => n.y - n.height / 2)),
  };
  const index = new Map(nodes.map((n, i) => [n.id, i]));

  // Nodes placed on top of each other are spread on a spiral first.
  const seen = new Set<string>();
  nodes.forEach((n, i) => {
    const key = `${Math.round(n.x)},${Math.round(n.y)}`;
    if (seen.has(key)) {
      const angle = i * 2.399963;
      const radius = 40 * Math.sqrt(i);
      n.x += Math.cos(angle) * radius;
      n.y += Math.sin(angle) * radius;
    }
    seen.add(`${Math.round(n.x)},${Math.round(n.y)}`);
    // A small deterministic shake, so nodes in a row can move past each other.
    n.x += ((i * 7) % 5) - 2;
    n.y += ((i * 11) % 7) - 3;
  });

  // A relation with a faction that has members pulls towards its first member.
  const firstMember = new Map<string, string>();
  for (const c of graph.characters) {
    const main = c.factionIds[0];
    if (main !== undefined && !firstMember.has(main)) firstMember.set(main, c.id);
  }
  const endpoint = (id: string) => index.get(firstMember.get(id) ?? id);
  const springs: [number, number, number][] = [];
  for (const r of graph.relations) {
    const a = endpoint(r.fromId);
    const b = endpoint(r.toId);
    if (a !== undefined && b !== undefined && a !== b) springs.push([a, b, 1]);
  }

  const n = nodes.length;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  let temperature = L;
  const cooling = temperature / (iterations + 1);

  for (let iter = 0; iter < iterations; iter++) {
    dx.fill(0);
    dy.fill(0);

    for (let i = 0; i < n; i++) {
      const a = nodes[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]!;
        let ddx = a.x - b.x;
        let ddy = a.y - b.y;
        let d = Math.hypot(ddx, ddy);
        if (d < 1) {
          ddx = ((i * 7 + j * 13) % 11) - 5 || 1;
          ddy = ((i * 5 + j * 3) % 7) - 3 || 1;
          d = Math.hypot(ddx, ddy);
        }
        // Nodes of different factions keep further apart, so frames do not overlap.
        const apart = a.group !== b.group ? 2 : 1;
        const force = (apart * L * L) / d;
        dx[i]! += (ddx / d) * force;
        dy[i]! += (ddy / d) * force;
        dx[j]! -= (ddx / d) * force;
        dy[j]! -= (ddy / d) * force;
      }
    }

    for (const [i, j, weight] of springs) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const ddx = a.x - b.x;
      const ddy = a.y - b.y;
      const d = Math.hypot(ddx, ddy) || 1;
      const force = (weight * d * d) / L;
      dx[i]! -= (ddx / d) * force;
      dy[i]! -= (ddy / d) * force;
      dx[j]! += (ddx / d) * force;
      dy[j]! += (ddy / d) * force;
    }

    // Faction members are pulled to the centre of their faction.
    const centres = new Map<string, { x: number; y: number; count: number }>();
    for (const node of nodes) {
      if (node.group === null) continue;
      const c = centres.get(node.group) ?? { x: 0, y: 0, count: 0 };
      c.x += node.x;
      c.y += node.y;
      c.count++;
      centres.set(node.group, c);
    }
    nodes.forEach((node, i) => {
      const c = node.group === null ? undefined : centres.get(node.group);
      if (!c || c.count < 2) return;
      const ddx = node.x - c.x / c.count;
      const ddy = node.y - c.y / c.count;
      const d = Math.hypot(ddx, ddy) || 1;
      const force = (3 * d * d) / L;
      dx[i]! -= (ddx / d) * force;
      dy[i]! -= (ddy / d) * force;
    });

    nodes.forEach((node, i) => {
      const len = Math.hypot(dx[i]!, dy[i]!);
      if (len === 0) return;
      const step = Math.min(len, temperature);
      node.x += (dx[i]! / len) * step;
      node.y += (dy[i]! / len) * step;
    });
    temperature = Math.max(temperature - cooling, 1);
  }

  const minX = Math.min(...nodes.map((node) => node.x - node.width / 2));
  const minY = Math.min(...nodes.map((node) => node.y - node.height / 2));
  for (const node of nodes) {
    result.set(node.id, {
      x: Math.round(node.x - node.width / 2 - minX + origin.x),
      y: Math.round(node.y - node.height / 2 - minY + origin.y),
    });
  }
  return result;
}
