import type { TokenCrop, TokenSize } from "./tokenCrop";

export interface Art {
  id: string;
  /** Relative to the library root, "/"-separated. */
  relPath: string;
  /** First folder of the path; null for files lying in the root. */
  system: string | null;
  /** Second folder of the path; null when the file is not inside a group. */
  group: string | null;
  /** Not in the System/Group/file layout (root, system level or nested deeper). */
  unsorted: boolean;
  fileName: string;
  size: number;
  /** Modification time, ms since epoch. */
  mtime: number;
  /** SHA-256 hex; null if the file could not be read yet. */
  hash: string | null;
  width: number | null;
  height: number | null;
  displayName: string | null;
  tags: string[];
  /** The file is gone from disk; the record is kept until the user cleans it up. */
  missing: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Round PNG made from an art (spec §2.5). */
export interface Token {
  id: string;
  artId: string;
  /** Relative to the library root; usually "<art folder>/_tokens/<art>.token-<n>.png". */
  relPath: string;
  size: TokenSize;
  crop: TokenCrop;
  createdAt: string;
  updatedAt: string;
}

/** A file seen on disk during a scan. */
export interface FoundFile {
  relPath: string;
  size: number;
  mtime: number;
}

export interface FileInspection {
  hash: string | null;
  width: number | null;
  height: number | null;
}

export type LibrarySelection =
  | { kind: "all" }
  | { kind: "system"; system: string }
  | { kind: "group"; system: string; group: string }
  | { kind: "unsorted" }
  | { kind: "missing" };
