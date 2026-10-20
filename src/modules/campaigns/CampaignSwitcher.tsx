import { useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { CampaignForm } from "./CampaignForm";
import { useCampaignStore } from "./store";

export function CampaignSwitcher({ libraryRoot }: { libraryRoot: string | null }) {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const activeId = useCampaignStore((s) => s.activeId);
  const setActive = useCampaignStore((s) => s.setActive);
  const [creating, setCreating] = useState(false);

  const active = campaigns.filter((c) => !c.archived);

  return (
    <div className="campaign-switcher">
      <label>
        <span className="label">{ru.campaign.switcherLabel}</span>
        <select
          value={activeId ?? ""}
          onChange={(e) => void setActive(e.target.value || null)}
          disabled={active.length === 0}
        >
          {active.length === 0 && <option value="">{ru.campaign.none}</option>}
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.system}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => setCreating(true)} title={ru.campaign.new}>
        + {ru.campaign.new}
      </button>
      {creating && <CampaignForm libraryRoot={libraryRoot} onClose={() => setCreating(false)} />}
    </div>
  );
}
