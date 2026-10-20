import { useState, type ReactNode } from "react";
import { ru } from "../../shared/i18n/ru";
import { CommitField, ConfirmDialog, TagEditor } from "../../shared/ui";
import { PortraitField, RelationList } from "./cardParts";
import {
  removeCharacter,
  updateCharacter,
  withMainFaction,
  type CharacterPatch,
} from "./domain/graph";
import {
  CHARACTER_KINDS,
  CHARACTER_STATUSES,
  type Character,
  type CharacterStatus,
  type RelationGraph,
} from "./domain/types";
import { useRelationsStore } from "./store";

interface CharacterCardProps {
  character: Character;
  graph: RelationGraph;
  libraryRoot: string;
  preferredSystem: string;
  /** Shown under the relations (events of the timeline). */
  extras?: ReactNode;
}

export function CharacterCard({
  character: c,
  graph,
  libraryRoot,
  preferredSystem,
  extras,
}: CharacterCardProps) {
  const edit = useRelationsStore((s) => s.edit);
  const select = useRelationsStore((s) => s.select);
  const [deleting, setDeleting] = useState(false);
  const t = ru.relations.character;
  const patch = (p: CharacterPatch) => edit((g, now) => updateCharacter(g, c.id, p, now));

  const factionById = new Map(graph.factions.map((f) => [f.id, f]));
  const memberOf = c.factionIds.flatMap((id) => factionById.get(id) ?? []);
  const others = graph.factions.filter((f) => !c.factionIds.includes(f.id));
  const relationCount = graph.relations.filter((r) => r.fromId === c.id || r.toId === c.id).length;

  return (
    <div className="graph-card" key={c.id}>
      <PortraitField
        libraryRoot={libraryRoot}
        preferredSystem={preferredSystem}
        name={c.name}
        portrait={c}
        onChange={(p) => patch(p)}
      />

      <CommitField
        label={t.name}
        value={c.name}
        required
        onCommit={(name) => patch({ name: name.trim() })}
      />

      <div className="field">
        <span>{t.kind}</span>
        <div className="segmented">
          {CHARACTER_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={c.kind === kind ? "active" : ""}
              onClick={() => patch({ kind })}
            >
              {ru.relations.kindNames[kind]}
            </button>
          ))}
        </div>
      </div>

      {c.kind === "pc" && (
        <CommitField label={t.player} value={c.player} onCommit={(player) => patch({ player })} />
      )}
      <CommitField label={t.role} value={c.role} onCommit={(role) => patch({ role })} />

      <label className="field">
        <span>{t.status}</span>
        <select
          value={c.status}
          onChange={(e) =>
            patch({
              status:
                CHARACTER_STATUSES.find((s) => s === e.target.value) ??
                ("unknown" as CharacterStatus),
            })
          }
        >
          {CHARACTER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ru.relations.statuses[s]}
            </option>
          ))}
        </select>
      </label>

      <TagEditor label={t.tags} tags={c.tags} onChange={(tags) => patch({ tags })} />

      <section className="card-section">
        <h3 className="subheading">{t.factions}</h3>
        {memberOf.length === 0 ? (
          <p className="muted">{t.noFactions}</p>
        ) : (
          <ul className="faction-list">
            {memberOf.map((f, i) => (
              <li key={f.id}>
                <span className="type-dot" style={{ background: f.color }} />
                <button
                  type="button"
                  className="link"
                  onClick={() => select({ kind: "faction", id: f.id })}
                >
                  {f.name}
                </button>
                {i === 0 ? (
                  <small className="muted">{t.mainFaction}</small>
                ) : (
                  <button
                    type="button"
                    className="small"
                    onClick={() => patch({ factionIds: withMainFaction(c.factionIds, f.id) })}
                  >
                    {t.makeMain}
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button"
                  title={t.removeFaction(f.name)}
                  aria-label={t.removeFaction(f.name)}
                  onClick={() => patch({ factionIds: c.factionIds.filter((id) => id !== f.id) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {others.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) patch({ factionIds: [...c.factionIds, e.target.value] });
            }}
          >
            <option value="">{t.addFaction}</option>
            {others.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </section>

      <CommitField
        label={t.description}
        value={c.description}
        multiline
        onCommit={(description) => patch({ description })}
      />
      <CommitField
        label={t.motivation}
        value={c.motivation}
        multiline
        onCommit={(motivation) => patch({ motivation })}
      />
      <CommitField
        label={t.secrets}
        value={c.secrets}
        multiline
        className="secret-field"
        onCommit={(secrets) => patch({ secrets })}
      />

      <RelationList graph={graph} nodeId={c.id} />
      {extras}

      <div className="art-actions">
        <button type="button" className="danger" onClick={() => setDeleting(true)}>
          {t.delete}
        </button>
      </div>

      {deleting && (
        <ConfirmDialog
          title={t.deleteTitle}
          text={t.deleteText(c.name, relationCount)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => {
            edit((g) => removeCharacter(g, c.id));
            select(null);
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
