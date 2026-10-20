import { useCallback, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus, Swords } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { useDismiss } from "../../shared/ui";
import { CampaignForm } from "./CampaignForm";
import { useCampaignStore } from "./store";

export function CampaignSwitcher({ libraryRoot }: { libraryRoot: string | null }) {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const activeId = useCampaignStore((s) => s.activeId);
  const setActive = useCampaignStore((s) => s.setActive);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const available = campaigns.filter((c) => !c.archived);
  const current = available.find((c) => c.id === activeId) ?? null;

  return (
    <div className="campaign-switcher" ref={ref}>
      <button
        type="button"
        className="campaign-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ru.campaign.switcherLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="campaign-mark" aria-hidden>
          <Swords />
        </span>
        <span className="campaign-trigger-text">
          <span className="campaign-trigger-label">{ru.campaign.switcherLabel}</span>
          <span className="campaign-trigger-name">
            {current ? current.name : ru.campaign.none}
            {current && <span className="muted"> · {current.system}</span>}
          </span>
        </span>
        <ChevronsUpDown className="campaign-trigger-chevron" aria-hidden />
      </button>
      {open && (
        <div className="popover campaign-menu">
          <ul className="menu-list" role="listbox" aria-label={ru.campaign.switcherLabel}>
            {available.length === 0 && <li className="muted">{ru.settings.noCampaigns}</li>}
            {available.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.id === activeId}
                  className={c.id === activeId ? "current" : undefined}
                  onClick={() => {
                    setOpen(false);
                    void setActive(c.id);
                  }}
                >
                  <Check className={c.id === activeId ? undefined : "invisible"} aria-hidden />
                  <span className="campaign-option-name">{c.name}</span>
                  <span className="muted">{c.system}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="menu-footer">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
            >
              <Plus aria-hidden />
              {ru.campaign.new}
            </button>
          </div>
        </div>
      )}
      {creating && <CampaignForm libraryRoot={libraryRoot} onClose={() => setCreating(false)} />}
    </div>
  );
}
