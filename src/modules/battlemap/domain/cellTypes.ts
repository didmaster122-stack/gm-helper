/** Fill pattern drawn over the cell colour. */
export type CellPattern = "none" | "hatch" | "hatch-dense" | "dots" | "cross";

/** Icons available for built-in and custom cell types. */
export const CELL_ICONS = [
  "door",
  "square",
  "stairs",
  "circle",
  "triangle",
  "diamond",
  "star",
  "cross",
] as const;
export type CellIcon = (typeof CELL_ICONS)[number];

/**
 * A letter (one character), an icon from {@link CELL_ICONS} or a custom picture
 * (a downscaled copy as a data URL, so it survives moving the source file).
 */
export type CellSymbol =
  | { kind: "letter"; value: string }
  | { kind: "icon"; value: CellIcon }
  | { kind: "image"; value: string };

export type SightBlock = "no" | "partial" | "yes";

export const BUILTIN_TYPE_IDS = [
  "floor",
  "wall",
  "door",
  "cover-half",
  "cover-full",
  "difficult",
  "object",
  "stairs",
  "water",
  "pit",
] as const;
export type BuiltinTypeId = (typeof BUILTIN_TYPE_IDS)[number];

export const FLOOR: BuiltinTypeId = "floor";
export const WALL: BuiltinTypeId = "wall";

export interface CellType {
  id: string;
  builtin: boolean;
  /** Display name; built-in names come from i18n and are filled in by the store. */
  name: string;
  color: string;
  pattern: CellPattern;
  symbol: CellSymbol | null;
  blocksMove: boolean;
  blocksSight: SightBlock;
  /** Free-text note of a custom type (rules, damage…); empty for built-ins. */
  comment: string;
}

/** Built-in types without names (names live in i18n). */
export const BUILTIN_TYPES: readonly Omit<CellType, "name">[] = [
  {
    id: "floor",
    builtin: true,
    color: "#e8e4da",
    pattern: "none",
    symbol: null,
    blocksMove: false,
    blocksSight: "no",
    comment: "",
  },
  {
    id: "wall",
    builtin: true,
    color: "#3b3b40",
    pattern: "none",
    symbol: null,
    blocksMove: true,
    blocksSight: "yes",
    comment: "",
  },
  {
    id: "door",
    builtin: true,
    color: "#9a6a3c",
    pattern: "none",
    symbol: { kind: "icon", value: "door" },
    blocksMove: false,
    blocksSight: "no",
    comment: "",
  },
  {
    id: "cover-half",
    builtin: true,
    color: "#c9c2b0",
    pattern: "hatch",
    symbol: null,
    blocksMove: false,
    blocksSight: "partial",
    comment: "",
  },
  {
    id: "cover-full",
    builtin: true,
    color: "#a59d8a",
    pattern: "hatch-dense",
    symbol: null,
    blocksMove: true,
    blocksSight: "yes",
    comment: "",
  },
  {
    id: "difficult",
    builtin: true,
    color: "#d6cfa8",
    pattern: "dots",
    symbol: null,
    blocksMove: false,
    blocksSight: "no",
    comment: "",
  },
  {
    id: "object",
    builtin: true,
    color: "#b8a88a",
    pattern: "none",
    symbol: { kind: "icon", value: "square" },
    blocksMove: true,
    blocksSight: "no",
    comment: "",
  },
  {
    id: "stairs",
    builtin: true,
    color: "#cfc6b4",
    pattern: "none",
    symbol: { kind: "icon", value: "stairs" },
    blocksMove: false,
    blocksSight: "no",
    comment: "",
  },
  {
    id: "water",
    builtin: true,
    color: "#5b8fc9",
    pattern: "none",
    symbol: null,
    blocksMove: false,
    blocksSight: "no",
    comment: "",
  },
  {
    id: "pit",
    builtin: true,
    color: "#111114",
    pattern: "cross",
    symbol: null,
    blocksMove: true,
    blocksSight: "no",
    comment: "",
  },
];

export function isBuiltinTypeId(id: string): id is BuiltinTypeId {
  return (BUILTIN_TYPE_IDS as readonly string[]).includes(id);
}

export function isCellIcon(value: string): value is CellIcon {
  return (CELL_ICONS as readonly string[]).includes(value);
}

/**
 * Stored form of a letter or icon: one character is a letter, otherwise an icon id;
 * empty means none. Pictures are stored separately, see {@link symbolImage}.
 */
export function encodeSymbol(symbol: CellSymbol | null): string {
  return symbol && symbol.kind !== "image" ? symbol.value : "";
}

/** Data URL of a picture symbol, empty otherwise. */
export function symbolImage(symbol: CellSymbol | null): string {
  return symbol?.kind === "image" ? symbol.value : "";
}

/** Inverse of {@link encodeSymbol} + {@link symbolImage}; a picture wins over text. */
export function decodeSymbol(text: string, image = ""): CellSymbol | null {
  if (image !== "") return { kind: "image", value: image };
  if (text === "") return null;
  if (isCellIcon(text)) return { kind: "icon", value: text };
  const letter = [...text][0];
  return letter ? { kind: "letter", value: letter } : null;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** Lookup that falls back to "Пол" for ids of deleted custom types. */
export function makeTypeLookup(types: readonly CellType[]): (id: string) => CellType {
  const byId = new Map(types.map((t) => [t.id, t]));
  const floor = byId.get(FLOOR);
  if (!floor) throw new Error("Cell types must include floor");
  return (id) => byId.get(id) ?? floor;
}

/** Text colour that stays readable on the given background. */
export function contrastColor(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#1a1a1e" : "#f2f2f2";
}
