import { useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Plus, Trash } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { Button, ConfirmDialog, IconButton, Modal } from "../../shared/ui";
import {
  addLane,
  addPersonalLane,
  charactersWithoutLane,
  moveLane,
  removeLane,
  updateLane,
} from "./domain/timeline";
import type { CharacterRef, Lane, Timeline } from "./domain/types";
import { useTimelineStore } from "./store";

interface LanesDialogProps {
  timeline: Timeline;
  /** Lanes as the user sees them, including hidden ones. */
  lanes: readonly Lane[];
  laneNames: Map<string, string>;
  /** Characters of the campaign, for personal lanes. */
  characters: readonly CharacterRef[];
  onClose: () => void;
}

/** Add, rename, reorder, hide and delete lanes. */
export function LanesDialog({ timeline, lanes, laneNames, characters, onClose }: LanesDialogProps) {
  const edit = useTimelineStore((s) => s.edit);
  const [deleting, setDeleting] = useState<Lane | null>(null);
  const t = ru.timeline.lane;
  const candidates = charactersWithoutLane(timeline, characters).sort((a, b) =>
    a.name.localeCompare(b.name, "ru"),
  );

  return (
    <Modal
      title={ru.timeline.lanesTitle}
      onClose={onClose}
      footer={<Button onClick={onClose}>{ru.common.close}</Button>}
    >
      <ul className="tl-lane-list">
        {lanes.map((lane, i) => {
          const name = laneNames.get(lane.id) ?? "";
          return (
            <li key={lane.id} className={lane.hidden ? "hidden" : undefined}>
              {lane.kind === "custom" ? (
                <LaneName
                  value={lane.name}
                  onCommit={(value) =>
                    edit((tl, src) => updateLane(tl, lane.id, { name: value }, src.now))
                  }
                />
              ) : (
                <span className="tl-lane-fixed" title={t.fixedHint}>
                  {name}
                </span>
              )}
              {lane.hidden && <small className="muted">{t.hidden}</small>}
              <IconButton
                icon={ArrowLeft}
                size="sm"
                label={t.up}
                disabled={i === 0}
                onClick={() => edit((tl, src) => moveLane(tl, lanes, lane.id, -1, src.now))}
              />
              <IconButton
                icon={ArrowRight}
                size="sm"
                label={t.down}
                disabled={i === lanes.length - 1}
                onClick={() => edit((tl, src) => moveLane(tl, lanes, lane.id, 1, src.now))}
              />
              <IconButton
                icon={lane.hidden ? EyeOff : Eye}
                size="sm"
                label={lane.hidden ? t.show : t.hide}
                active={lane.hidden}
                onClick={() =>
                  edit((tl, src) => updateLane(tl, lane.id, { hidden: !lane.hidden }, src.now))
                }
              />
              {lane.kind !== "main" ? (
                <IconButton
                  icon={Trash}
                  size="sm"
                  className="danger"
                  label={t.delete}
                  onClick={() => setDeleting(lane)}
                />
              ) : (
                <span className="tl-lane-spacer" />
              )}
            </li>
          );
        })}
      </ul>
      <div className="tl-lanes-add">
        <Button icon={Plus} onClick={() => edit((tl, src) => addLane(tl, t.newName, src))}>
          {t.add}
        </Button>
        {candidates.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const character = candidates.find((c) => c.id === e.target.value);
              if (character) edit((tl, src) => addPersonalLane(tl, character, src));
            }}
          >
            <option value="">{t.addPersonal}</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="hint">{t.personalHint}</p>

      {deleting && (
        <ConfirmDialog
          title={t.deleteTitle}
          text={t.deleteText(
            laneNames.get(deleting.id) ?? deleting.name,
            timeline.events.filter((e) => e.laneId === deleting.id).length,
          )}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => edit((tl, src) => removeLane(tl, deleting.id, src.now))}
          onClose={() => setDeleting(null)}
        />
      )}
    </Modal>
  );
}

/** Lane name that saves on blur or Enter; an empty name is not saved. */
function LaneName({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  return (
    <input
      value={draft}
      aria-label={ru.timeline.lane.name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const name = draft.trim();
        if (name && name !== value) onCommit(name);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
