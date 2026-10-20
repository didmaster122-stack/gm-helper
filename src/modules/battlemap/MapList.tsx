import { useEffect, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { ConfirmDialog, EmptyState } from "../../shared/ui";
import type { Campaign } from "../campaigns";
import { MapForm } from "./MapForm";
import type { BattlemapSummary } from "./repo";
import { useEditorStore, useMapListStore } from "./store";

const NO_MAPS: BattlemapSummary[] = [];

export function MapList({ campaign }: { campaign: Campaign }) {
  // A stable empty array: a new one on every call would re-render forever.
  const maps = useMapListStore((s) => (s.campaignId === campaign.id ? s.maps : NO_MAPS));
  const load = useMapListStore((s) => s.load);
  const remove = useMapListStore((s) => s.remove);
  const openById = useEditorStore((s) => s.openById);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BattlemapSummary | null>(null);
  const [deleting, setDeleting] = useState<BattlemapSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load(campaign.id);
  }, [campaign.id, load]);

  async function open(id: string) {
    setError(null);
    try {
      await openById(id);
    } catch (e) {
      console.error(e);
      setError(ru.battlemap.loadError);
    }
  }

  const createButton = (
    <button type="button" className="primary" onClick={() => setCreating(true)}>
      {ru.battlemap.newMap}
    </button>
  );

  return (
    <div className="screen map-list-screen">
      {maps.length === 0 ? (
        <EmptyState
          title={ru.battlemap.emptyTitle}
          text={ru.battlemap.emptyText}
          action={createButton}
        />
      ) : (
        <>
          <div className="screen-heading">
            <h1>{ru.battlemap.title}</h1>
            {createButton}
          </div>
          {error && <p className="error">{error}</p>}
          <ul className="map-list">
            {maps.map((m) => (
              <li key={m.id}>
                <button type="button" className="map-list-open" onClick={() => void open(m.id)}>
                  <strong>{m.name}</strong>
                  <span className="muted">{ru.battlemap.sizeCells(m.width, m.height)}</span>
                  {m.description && <span className="muted map-list-desc">{m.description}</span>}
                </button>
                <div className="row-actions">
                  <button type="button" onClick={() => setEditing(m)}>
                    {ru.common.change}
                  </button>
                  <button type="button" className="danger" onClick={() => setDeleting(m)}>
                    {ru.common.delete}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {creating && (
        <MapForm
          campaignId={campaign.id}
          onCreated={(m) => void open(m.id)}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <MapForm campaignId={campaign.id} map={editing} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title={ru.battlemap.deleteTitle}
          text={ru.battlemap.deleteText(deleting.name)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => remove(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
