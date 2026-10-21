import type { ReactNode } from "react";

interface ScreenHeaderProps {
  title: string;
  /** Where the screen is, outermost first, e.g. a system and a group. */
  path?: string[];
  /** One line under the title: counts, filters in effect. */
  summary?: ReactNode;
  /** The screen's search and buttons; at most one of them is primary. */
  actions?: ReactNode;
}

/** The single header of a screen. */
export function ScreenHeader({ title, path, summary, actions }: ScreenHeaderProps) {
  return (
    <header className="screen-header">
      <div className="screen-header-titles">
        {path && path.length > 0 && (
          <ol className="screen-header-path">
            {path.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
        )}
        <h1>{title}</h1>
        {summary && <div className="screen-header-summary">{summary}</div>}
      </div>
      {actions && <div className="screen-header-actions">{actions}</div>}
    </header>
  );
}
