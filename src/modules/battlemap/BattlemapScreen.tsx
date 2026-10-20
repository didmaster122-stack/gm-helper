import { ru } from "../../shared/i18n/ru";
import { EmptyState } from "../../shared/ui";
import type { Campaign } from "../campaigns";

export function BattlemapScreen({ campaign }: { campaign: Campaign }) {
  return (
    <EmptyState
      title={`${ru.nav.battlemaps} · ${campaign.name}`}
      text={ru.placeholder.comingSoon(3)}
    />
  );
}
