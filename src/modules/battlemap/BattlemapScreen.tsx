import { useEffect } from "react";
import type { Campaign } from "../campaigns";
import { useCellTypeStore } from "./cellTypeStore";
import { LibraryContext } from "./libraryContext";
import { MapEditor } from "./MapEditor";
import { MapList } from "./MapList";
import { useObjectStore } from "./objectStore";
import { useEditorStore } from "./store";

interface BattlemapScreenProps {
  campaign: Campaign;
  /** Library root for pictures of cell types and objects. */
  libraryRoot: string | null;
}

export function BattlemapScreen({ campaign, libraryRoot }: BattlemapScreenProps) {
  const map = useEditorStore((s) => s.map);
  const close = useEditorStore((s) => s.close);
  const types = useCellTypeStore((s) => s.types);
  const loadTypes = useCellTypeStore((s) => s.load);
  const objectDefs = useObjectStore((s) => s.defs);
  const objectsLoaded = useObjectStore((s) => s.loaded);
  const loadObjects = useObjectStore((s) => s.load);

  useEffect(() => {
    void loadTypes();
    void loadObjects();
  }, [loadTypes, loadObjects]);

  // Switching the campaign closes a map of the previous one (saving it first).
  // Templates belong to no campaign and stay open.
  const foreign = map !== null && !map.isTemplate && map.campaignId !== campaign.id;
  useEffect(() => {
    if (foreign) void close();
  }, [foreign, close]);

  const ready = types.length > 0 && objectsLoaded;
  return (
    <LibraryContext.Provider value={{ root: libraryRoot, system: campaign.system }}>
      {map && !foreign && ready ? (
        <MapEditor key={map.id} types={types} objectDefs={objectDefs} />
      ) : (
        <MapList campaign={campaign} />
      )}
    </LibraryContext.Provider>
  );
}
