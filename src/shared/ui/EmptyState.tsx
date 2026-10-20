import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  text?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  /** Smaller, for panels and lists inside a screen. */
  compact?: boolean;
  tone?: "default" | "error";
}

export function EmptyState({
  title,
  text,
  icon: Icon,
  action,
  compact = false,
  tone = "default",
}: EmptyStateProps) {
  const className = ["empty-state", compact && "compact", tone === "error" && "error-state"]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={className}>
      {Icon && (
        <div className="empty-state-icon" aria-hidden>
          <Icon />
        </div>
      )}
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action && <div className="empty-state-actions">{action}</div>}
    </div>
  );
}
