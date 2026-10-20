import { useEffect } from "react";
import type { Campaign } from "../campaigns";
import { useCellTypeStore } from "./cellTypeStore";
import { MapEditor } from "./MapEditor";
import { MapList } from "./MapList";
import { useEditorStore } from "./store";

export function BattlemapScreen({ campaign }: { campaign: Campaign }) {
  const map = useEditorStore((s) => s.map);
  const close = useEditorStore((s) => s.close);
  const types = useCellTypeStore((s) => s.types);
  const loadTypes = useCellTypeStore((s) => s.load);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  // Switching the campaign closes a map of the previous one (saving it first).
  const foreign = map !== null && map.campaignId !== campaign.id;
  useEffect(() => {
    if (foreign) void close();
  }, [foreign, close]);

  if (map && !foreign && types.length > 0) return <MapEditor key={map.id} types={types} />;
  return <MapList campaign={campaign} />;
}
