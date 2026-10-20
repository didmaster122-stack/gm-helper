// Test fixtures for the relation graph. Never import from app code.
import type { Character, Faction, Relation } from "./types";

const T = "2026-10-20T12:00:00.000Z";

export function character(id: string, patch: Partial<Character> = {}): Character {
  return {
    id,
    campaignId: "camp",
    name: id,
    kind: "npc",
    player: "",
    role: "",
    status: "alive",
    description: "",
    motivation: "",
    secrets: "",
    tags: [],
    factionIds: [],
    artId: null,
    tokenId: null,
    x: 0,
    y: 0,
    createdAt: T,
    updatedAt: T,
    ...patch,
  };
}

export function faction(id: string, patch: Partial<Faction> = {}): Faction {
  return {
    id,
    campaignId: "camp",
    name: id,
    color: "#c9a24a",
    description: "",
    artId: null,
    tokenId: null,
    x: 0,
    y: 0,
    createdAt: T,
    updatedAt: T,
    ...patch,
  };
}

export function relation(
  id: string,
  fromId: string,
  toId: string,
  patch: Partial<Relation> = {},
): Relation {
  return {
    id,
    campaignId: "camp",
    fromId,
    toId,
    typeId: "friendship",
    mutual: false,
    label: "",
    note: "",
    createdAt: T,
    updatedAt: T,
    ...patch,
  };
}
