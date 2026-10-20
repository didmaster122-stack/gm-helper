import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  text?: string;
  action?: ReactNode;
}

export function EmptyState({ title, text, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
