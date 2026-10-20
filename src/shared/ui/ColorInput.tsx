import { useEffect, useRef, useState } from "react";

/**
 * Colour picker that saves after the user stops dragging instead of on every change.
 * The parent keys it by the saved colour, so an outside change resets it.
 */
export function ColorInput({
  value,
  onCommit,
  title,
}: {
  value: string;
  onCommit: (color: string) => void;
  title?: string;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <input
      type="color"
      className="color-input"
      title={title}
      aria-label={title}
      value={local}
      onChange={(e) => {
        const color = e.target.value;
        setLocal(color);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(color), 300);
      }}
    />
  );
}
