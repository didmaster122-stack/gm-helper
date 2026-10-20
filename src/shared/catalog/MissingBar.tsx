import { useState } from "react";
import { Eraser } from "lucide-react";
import { ru } from "../i18n/ru";
import { Button, ConfirmDialog } from "../ui";

interface MissingBarProps {
  hint: string;
  buttonLabel: string;
  confirmTitle: string;
  confirmText: string;
  /** Nothing to clean up: the button is hidden. */
  empty: boolean;
  onConfirm: () => Promise<void>;
}

/** Hint over the list of missing files with "clean up the list" (after confirmation). */
export function MissingBar({
  hint,
  buttonLabel,
  confirmTitle,
  confirmText,
  empty,
  onConfirm,
}: MissingBarProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="missing-bar">
      <p className="library-hint">{hint}</p>
      {!empty && (
        <Button icon={Eraser} variant="danger" size="sm" onClick={() => setConfirming(true)}>
          {buttonLabel}
        </Button>
      )}
      {confirming && (
        <ConfirmDialog
          title={confirmTitle}
          text={confirmText}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={onConfirm}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
