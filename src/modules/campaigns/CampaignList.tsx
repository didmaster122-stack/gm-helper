import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Trash } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { ConfirmDialog, IconButton } from "../../shared/ui";
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
      <ul className="row-list campaign-list">
        {campaigns.map((c) => (
          <li key={c.id} className={c.archived ? "archived" : undefined}>
            <div className="row-info">
              <div className="row-title">
                <strong>{c.name}</strong>
                {c.id === activeId && <span className="badge accent">{ru.campaign.active}</span>}
                {c.archived && <span className="badge">{ru.campaign.archived}</span>}
              </div>
              <div className="muted">{c.system}</div>
            </div>
            <div className="row-actions">
              <IconButton icon={Pencil} label={ru.common.change} onClick={() => setEditing(c)} />
              <IconButton
                icon={c.archived ? ArchiveRestore : Archive}
                label={c.archived ? ru.campaign.unarchive : ru.campaign.archive}
                onClick={() => void setArchived(c.id, !c.archived)}
              />
              <IconButton
                icon={Trash}
                label={ru.common.delete}
                className="danger"
                onClick={() => setDeleting(c)}
              />
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
