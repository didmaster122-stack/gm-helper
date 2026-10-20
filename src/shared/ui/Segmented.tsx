import type { LucideIcon } from "lucide-react";
import { withShortcut } from "./withShortcut";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Show only the icon; the label becomes the tooltip. */
  iconOnly?: boolean;
  shortcut?: string;
  title?: string;
}

interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  size?: "md" | "sm";
  className?: string;
}

/** A row of mutually exclusive choices on one track. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = "md",
  className,
}: SegmentedProps<T>) {
  const cls = ["segmented", size === "sm" && "sm", className].filter(Boolean).join(" ");
  return (
    <div className={cls} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const Icon = o.icon;
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.iconOnly ? o.label : undefined}
            className={selected ? "selected" : undefined}
            title={withShortcut(o.title ?? (o.iconOnly ? o.label : undefined), o.shortcut)}
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon aria-hidden />}
            {!o.iconOnly && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
