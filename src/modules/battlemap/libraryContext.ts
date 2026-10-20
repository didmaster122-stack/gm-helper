import { createContext, useContext } from "react";

/** Where the art library is, for picking pictures of cell types and objects. */
export interface LibraryAccess {
  root: string | null;
  /** System of the active campaign: searched first in the picker. */
  system: string | null;
}

export const LibraryContext = createContext<LibraryAccess>({ root: null, system: null });

export function useLibraryAccess(): LibraryAccess {
  return useContext(LibraryContext);
}
