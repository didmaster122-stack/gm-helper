import { useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { ConfirmDialog } from "../../shared/ui";
import { CampaignForm } from "./CampaignForm";
import { useCampaignStore } from "./store";
import type { Campaign } from "./types";

/** Campaign management table for the settings screen. */
export function CampaignList({ libraryRoot }: { libraryRoot: string | null }) {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const activeId = useCampaignStore((s) => s.activeId);
  const setArchived = useCampaignStore((s) => s.setArchived);
  const remove = useCampaignStore((s) => s.remove);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState<Campaign | null>(null);

  if (campaigns.length === 0) return <p className="muted">{ru.settings.noCampaigns}</p>;

  return (
    <>
      <ul className="campaign-list">
        {campaigns.map((c) => (
          <li key={c.id} className={c.archived ? "archived" : undefined}>
            <div className="campaign-info">
              <strong>{c.name}</strong>
              {c.id === activeId && <span className="badge accent">●</span>}
              {c.archived && <span className="badge">{ru.campaign.archived}</span>}
              <div className="muted">{c.system}</div>
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => setEditing(c)}>
                {ru.common.change}
              </button>
              <button type="button" onClick={() => void setArchived(c.id, !c.archived)}>
                {c.archived ? ru.campaign.unarchive : ru.campaign.archive}
              </button>
              <button type="button" className="danger" onClick={() => setDeleting(c)}>
                {ru.common.delete}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <CampaignForm
          campaign={editing}
          libraryRoot={libraryRoot}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={ru.campaign.deleteTitle}
          text={ru.campaign.deleteText(deleting.name)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => remove(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
