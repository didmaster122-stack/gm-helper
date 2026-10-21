import { useCallback, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useDismiss } from "./useDismiss";

export interface MenuSelectOption<T extends string> {
  value: T;
  label: string;
}

interface MenuSelectProps<T extends string> {
  /** Accessible name of the menu. */
  label: string;
  /** Text on the button, e.g. "Sort: by name". */
  buttonLabel: string;
  options: MenuSelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  title?: string;
}

/** A compact button that opens a menu of mutually exclusive choices (e.g. sort order). */
export function MenuSelect<T extends string>({
  label,
  buttonLabel,
  options,
  value,
  onChange,
  disabled,
  title,
}: MenuSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div className="menu-select" ref={ref}>
      <button
        type="button"
        className="menu-select-button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={title}
        onClick={() => setOpen((o) => !o)}
      >
        {buttonLabel}
        <ChevronDown aria-hidden />
      </button>
      {open && (
        <ul className="popover menu-list" role="menu" aria-label={label}>
          {options.map((o) => (
            <li key={o.value} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
              >
                <Check className="menu-check" aria-hidden />
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
