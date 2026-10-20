import { ru } from "../../shared/i18n/ru";
import { EmptyState } from "../../shared/ui";
import type { Campaign } from "../campaigns";

export function RelationsScreen({ campaign }: { campaign: Campaign }) {
  return (
    <EmptyState
      title={`${ru.nav.relations} · ${campaign.name}`}
      text={ru.placeholder.comingSoon(5)}
    />
  );
}
