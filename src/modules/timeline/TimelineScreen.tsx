import { ru } from "../../shared/i18n/ru";
import { EmptyState } from "../../shared/ui";
import type { Campaign } from "../campaigns";

export function TimelineScreen({ campaign }: { campaign: Campaign }) {
  return (
    <EmptyState
      title={`${ru.nav.timeline} · ${campaign.name}`}
      text={ru.placeholder.comingSoon(6)}
    />
  );
}
