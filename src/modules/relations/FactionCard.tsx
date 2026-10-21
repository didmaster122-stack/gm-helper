import { useState } from "react";
import { Trash } from "lucide-react";
import { ru } from "../../shared/i18n/ru";
import { Button, ColorInput, CommitField, ConfirmDialog } from "../../shared/ui";
import { PortraitField, RelationList } from "./cardParts";
import { removeFaction, updateFaction, type FactionPatch } from "./domain/graph";
import type { Faction, RelationGraph } from "./domain/types";
import { useRelationsStore } from "./store";

interface FactionCardProps {
  faction: Faction;
  graph: RelationGraph;
  libraryRoot: string;
  preferredSystem: string;
}

export function FactionCard({ faction: f, graph, libraryRoot, preferredSystem }: FactionCardProps) {
  const edit = useRelationsStore((s) => s.edit);
  const select = useRelationsStore((s) => s.select);
  const setFocus = useRelationsStore((s) => s.setFocus);
  const [deleting, setDeleting] = useState(false);
  const t = ru.relations.faction;
  const patch = (p: FactionPatch) => edit((g, now) => updateFaction(g, f.id, p, now));
  const members = graph.characters.filter((c) => c.factionIds.includes(f.id));

  return (
    <div className="graph-card" key={f.id}>
      <CommitField
        className="card-title-field"
        label={t.name}
        value={f.name}
        required
        onCommit={(name) => patch({ name: name.trim() })}
      />
      <label className="field field-inline">
        <span>{t.color}</span>
        <ColorInput key={f.color} value={f.color} onCommit={(color) => patch({ color })} />
      </label>
      <CommitField
        label={t.description}
        value={f.description}
        multiline
        onCommit={(description) => patch({ description })}
      />

      <div className="field">
        <span>{t.emblem}</span>
        <PortraitField
          libraryRoot={libraryRoot}
          preferredSystem={preferredSystem}
          name={f.name}
          portrait={f}
          onChange={(p) => patch(p)}
        />
      </div>

      <section className="card-section">
        <h3 className="subheading">{t.members}</h3>
        {members.length === 0 ? (
          <p className="muted">{t.noMembers}</p>
        ) : (
          <ul className="faction-list">
            {members.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    select({ kind: "character", id: c.id });
                    setFocus(c.id);
                  }}
                >
                  {c.name}
                </button>
                {c.factionIds[0] === f.id && (
                  <small className="muted">{ru.relations.character.mainFaction}</small>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RelationList graph={graph} nodeId={f.id} />

      <div className="panel-actions">
        <Button variant="danger" icon={Trash} onClick={() => setDeleting(true)}>
          {t.delete}
        </Button>
      </div>

      {deleting && (
        <ConfirmDialog
          title={t.deleteTitle}
          text={t.deleteText(f.name)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => {
            edit((g, now) => removeFaction(g, f.id, now));
            select(null);
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
