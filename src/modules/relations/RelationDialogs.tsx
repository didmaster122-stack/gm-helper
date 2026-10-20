import { useState, type FormEvent } from "react";
import { ru } from "../../shared/i18n/ru";
import { Modal } from "../../shared/ui";
import { addFaction, addRelation, nodeName } from "./domain/graph";
import { CHARACTER_KINDS, type CharacterKind, type RelationGraph } from "./domain/types";
import { useRelationTypeStore } from "./relationTypeStore";
import { createCharacter, useRelationsStore } from "./store";

/** Relation type chooser: chips with the colour of each type. */
export function TypeSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const types = useRelationTypeStore((s) => s.types);
  return (
    <div className="field">
      <span>{ru.relations.relation.type}</span>
      <div className="type-chips" role="radiogroup">
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === value}
            className={t.id === value ? "type-chip active" : "type-chip"}
            style={t.id === value ? { borderColor: t.color } : undefined}
            onClick={() => onChange(t.id)}
          >
            <span className="type-dot" style={{ background: t.color }} />
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

interface NewRelationDialogProps {
  graph: RelationGraph;
  fromId: string;
  toId: string;
  onClose: () => void;
}

export function NewRelationDialog({ graph, fromId, toId, onClose }: NewRelationDialogProps) {
  const edit = useRelationsStore((s) => s.edit);
  const select = useRelationsStore((s) => s.select);
  const lastTypeId = useRelationsStore((s) => s.lastTypeId);
  const setLastTypeId = useRelationsStore((s) => s.setLastTypeId);
  const types = useRelationTypeStore((s) => s.types);
  const [typeId, setTypeId] = useState(
    types.some((t) => t.id === lastTypeId) ? lastTypeId : (types[0]?.id ?? "unknown"),
  );
  const [mutual, setMutual] = useState(false);
  const [label, setLabel] = useState("");
  const t = ru.relations.relation;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const id = crypto.randomUUID();
    const campaignId = useRelationsStore.getState().campaignId ?? "";
    edit((g, now) =>
      addRelation(g, {
        id,
        campaignId,
        fromId,
        toId,
        typeId,
        mutual,
        label: label.trim(),
        note: "",
        createdAt: now,
        updatedAt: now,
      }),
    );
    setLastTypeId(typeId);
    select({ kind: "relation", id });
    onClose();
  }

  return (
    <Modal
      title={t.newTitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            {ru.common.cancel}
          </button>
          <button type="button" className="primary" onClick={() => submit()}>
            {t.create}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={submit}>
        <div className="relation-ends">
          <strong>{nodeName(graph, fromId)}</strong>
          <span className="muted">{mutual ? t.both : t.arrow}</span>
          <strong>{nodeName(graph, toId)}</strong>
        </div>
        <TypeSelect value={typeId} onChange={setTypeId} />
        <label className="check">
          <input type="checkbox" checked={mutual} onChange={(e) => setMutual(e.target.checked)} />
          <span>{t.mutual}</span>
        </label>
        <label className="field">
          <span>{t.label}</span>
          <input
            value={label}
            placeholder={t.labelHint}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
        </label>
      </form>
    </Modal>
  );
}

interface NewNodeDialogProps {
  campaignId: string;
  /** Top-left position of the new node (the centre of the view). */
  position: () => { x: number; y: number };
  onClose: () => void;
}

export function NewCharacterDialog({ campaignId, position, onClose }: NewNodeDialogProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CharacterKind>("npc");
  const [player, setPlayer] = useState("");
  const t = ru.relations.character;
  const valid = name.trim() !== "";

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!valid) return;
    void createCharacter(campaignId, { name, kind, player, position: position() });
    onClose();
  }

  return (
    <Modal
      title={ru.relations.newCharacterTitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            {ru.common.cancel}
          </button>
          <button type="button" className="primary" disabled={!valid} onClick={() => submit()}>
            {ru.common.create}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>{t.name}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="field">
          <span>{t.kind}</span>
          <div className="segmented">
            {CHARACTER_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={kind === k ? "active" : ""}
                onClick={() => setKind(k)}
              >
                {ru.relations.kindNames[k]}
              </button>
            ))}
          </div>
        </div>
        {kind === "pc" && (
          <label className="field">
            <span>{t.player}</span>
            <input value={player} onChange={(e) => setPlayer(e.target.value)} />
          </label>
        )}
        {/* Enter submits a form only when it has a submit button. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

const FACTION_COLORS = ["#c9a24a", "#4f9fd8", "#d0574f", "#5cb85c", "#a98bdb", "#e08a3c"];

export function NewFactionDialog({ campaignId, position, onClose }: NewNodeDialogProps) {
  const edit = useRelationsStore((s) => s.edit);
  const select = useRelationsStore((s) => s.select);
  const count = useRelationsStore((s) => s.history.present.factions.length);
  const [name, setName] = useState("");
  const [color, setColor] = useState(FACTION_COLORS[count % FACTION_COLORS.length] ?? "#c9a24a");
  const t = ru.relations.faction;
  const valid = name.trim() !== "";

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!valid) return;
    const id = crypto.randomUUID();
    const { x, y } = position();
    edit((g, now) =>
      addFaction(g, {
        id,
        campaignId,
        name: name.trim(),
        color,
        description: "",
        artId: null,
        tokenId: null,
        x: Math.round(x),
        y: Math.round(y),
        createdAt: now,
        updatedAt: now,
      }),
    );
    select({ kind: "faction", id });
    onClose();
  }

  return (
    <Modal
      title={ru.relations.newFactionTitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            {ru.common.cancel}
          </button>
          <button type="button" className="primary" disabled={!valid} onClick={() => submit()}>
            {ru.common.create}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>{t.name}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field field-inline">
          <span>{t.color}</span>
          <input
            type="color"
            className="color-input"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
