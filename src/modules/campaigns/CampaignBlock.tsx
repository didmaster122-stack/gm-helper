import { ChevronsUpDown, Swords } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { useActiveCampaign } from "./store";

/** Up to two initials for the folded spine: "Проклятие Страда" → "ПС". */
function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

interface CampaignBlockProps {
  /** Folded spine: only the initials, the name goes to the tooltip. */
  collapsed?: boolean;
  /** Shown after the system, e.g. the number of the last played session. */
  detail?: string | null;
  /** Opens the welcome screen with the list of campaigns. */
  onOpen: () => void;
}

/** Active campaign block at the top of the spine. */
export function CampaignBlock({ collapsed = false, detail = null, onOpen }: CampaignBlockProps) {
  const current = useActiveCampaign();
  const subtitle = current ? [current.system, detail].filter(Boolean).join(" · ") : "";
  const summary = current ? `${current.name} · ${subtitle}` : ru.campaign.none;

  return (
    <div className={collapsed ? "campaign-block collapsed" : "campaign-block"}>
      <button
        type="button"
        className="campaign-trigger"
        aria-label={`${summary}. ${ru.campaign.all}`}
        title={collapsed ? `${summary}. ${ru.campaign.all}` : ru.campaign.all}
        onClick={onOpen}
      >
        {collapsed ? (
          <span className="campaign-monogram" aria-hidden>
            {current ? monogram(current.name) : <Swords />}
          </span>
        ) : (
          <>
            <span className="campaign-trigger-label">{ru.campaign.switcherLabel}</span>
            <span className="campaign-trigger-name">
              {current ? current.name : ru.campaign.none}
            </span>
            {current && <span className="campaign-trigger-system">{subtitle}</span>}
            <ChevronsUpDown className="campaign-trigger-chevron" aria-hidden />
          </>
        )}
      </button>
    </div>
  );
}
