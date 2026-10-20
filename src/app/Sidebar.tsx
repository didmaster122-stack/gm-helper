import { ru } from "../shared/i18n/ru";
import { useAppStore, type ModuleId } from "./store";

interface NavItem {
  id: ModuleId;
  label: string;
  icon: string;
}

const items: NavItem[] = [
  { id: "library", label: ru.nav.library, icon: "🖼" },
  { id: "battlemaps", label: ru.nav.battlemaps, icon: "▦" },
  { id: "relations", label: ru.nav.relations, icon: "⚭" },
  { id: "timeline", label: ru.nav.timeline, icon: "⟿" },
];

export function Sidebar() {
  const current = useAppStore((s) => s.module);
  const setModule = useAppStore((s) => s.setModule);

  const button = (item: NavItem) => (
    <button
      key={item.id}
      type="button"
      className={item.id === current ? "nav-item active" : "nav-item"}
      onClick={() => setModule(item.id)}
      aria-current={item.id === current ? "page" : undefined}
    >
      <span className="nav-icon" aria-hidden>
        {item.icon}
      </span>
      {item.label}
    </button>
  );

  return (
    <nav className="sidebar">
      <div className="brand">{ru.appName}</div>
      {items.map(button)}
      <div className="spacer" />
      {button({ id: "settings", label: ru.nav.settings, icon: "⚙" })}
    </nav>
  );
}
