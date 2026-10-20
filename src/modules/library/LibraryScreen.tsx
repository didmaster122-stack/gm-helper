import { ru } from "../../shared/i18n/ru";
import { EmptyState } from "../../shared/ui";

export function LibraryScreen() {
  return <EmptyState title={ru.nav.library} text={ru.placeholder.comingSoon(1)} />;
}
