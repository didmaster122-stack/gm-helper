import { ArrowLeftRight, Trash } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { Button, CommitField } from "../../shared/ui";
import { nodeName, removeRelation, updateRelation, type RelationPatch } from "./domain/graph";
import type { Relation, RelationGraph } from "./domain/types";
import { TypeSelect } from "./RelationDialogs";
import { useRelationsStore } from "./store";

export function RelationCard({ relation: r, graph }: { relation: Relation; graph: RelationGraph }) {
  const edit = useRelationsStore((s) => s.edit);
  const select = useRelationsStore((s) => s.select);
  const setFocus = useRelationsStore((s) => s.setFocus);
  const t = ru.relations.relation;
  const patch = (p: RelationPatch) => edit((g, now) => updateRelation(g, r.id, p, now));

  const end = (id: string) => {
    const kind = graph.characters.some((c) => c.id === id) ? "character" : "faction";
    return (
      <button
        type="button"
        className="link"
        onClick={() => {
          select({ kind, id });
          setFocus(id);
        }}
      >
        {nodeName(graph, id) ?? "—"}
      </button>
    );
  };

  return (
    <div className="graph-card" key={r.id}>
      <h2 className="graph-card-title">{t.title}</h2>
      <div className="relation-ends">
        {end(r.fromId)}
        <span className="muted">{r.mutual ? t.both : t.arrow}</span>
        {end(r.toId)}
      </div>
      <TypeSelect value={r.typeId} onChange={(typeId) => patch({ typeId })} />
      <label className="check">
        <input
          type="checkbox"
          checked={r.mutual}
          onChange={(e) => patch({ mutual: e.target.checked })}
        />
        <span>{t.mutual}</span>
      </label>
      <small className="hint">{t.mutualHint}</small>
      <CommitField
        label={t.label}
        value={r.label}
        placeholder={t.labelHint}
        onCommit={(label) => patch({ label: label.trim() })}
      />
      <CommitField label={t.note} value={r.note} multiline onCommit={(note) => patch({ note })} />
      <div className="panel-actions">
        {!r.mutual && (
          <Button icon={ArrowLeftRight} onClick={() => patch({ fromId: r.toId, toId: r.fromId })}>
            {t.reverse}
          </Button>
        )}
        <Button
          variant="danger"
          icon={Trash}
          shortcut="Delete"
          title={t.delete}
          onClick={() => {
            edit((g) => removeRelation(g, r.id));
            select(null);
          }}
        >
          {t.delete}
        </Button>
      </div>
    </div>
  );
}
