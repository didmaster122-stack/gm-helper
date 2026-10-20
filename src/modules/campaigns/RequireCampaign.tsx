import { useState, type ReactNode } from "react";
import { Plus, Swords } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { Button, EmptyState } from "../../shared/ui";
import { CampaignForm } from "./CampaignForm";
import { useActiveCampaign } from "./store";
import type { Campaign } from "./types";

interface RequireCampaignProps {
  libraryRoot: string | null;
  children: (campaign: Campaign) => ReactNode;
}

/** Renders children only when a campaign is active; otherwise offers to create one. */
export function RequireCampaign({ libraryRoot, children }: RequireCampaignProps) {
  const campaign = useActiveCampaign();
  const [creating, setCreating] = useState(false);

  if (campaign) return <>{children(campaign)}</>;

  return (
    <>
      <EmptyState
        icon={Swords}
        title={ru.campaign.needCampaignTitle}
        text={ru.campaign.needCampaignText}
        action={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            {ru.campaign.new}
          </Button>
        }
      />
      {creating && <CampaignForm libraryRoot={libraryRoot} onClose={() => setCreating(false)} />}
    </>
  );
}
