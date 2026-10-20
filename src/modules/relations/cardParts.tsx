import { useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { ArtPicker } from "../library";
import { nodeName } from "./domain/graph";
import type { Portrait, RelationGraph } from "./domain/types";
import { PortraitView } from "./portraits";
import { usePortraitResolver } from "./usePortraitResolver";
import { typeLookup, useRelationTypeStore } from "./relationTypeStore";
import { useRelationsStore } from "./store";

interface PortraitFieldProps {
  libraryRoot: string;
  preferredSystem: string;
  name: string;
  portrait: Portrait;
  onChange: (portrait: Portrait) => void;
}

/** Big round picture with "pick art" (art or one of its tokens) and "remove". */
export function PortraitField({
  libraryRoot,
  preferredSystem,
  name,
  portrait,
  onChange,
}: PortraitFieldProps) {
  const resolve = usePortraitResolver(libraryRoot);
  const [picking, setPicking] = useState(false);
  const image = resolve(portrait);
  const t = ru.relations.portrait;

  return (
    <div className="portrait-field">
      <div className="portrait-big">
        <PortraitView image={image} name={name} />
      </div>
      <div className="portrait-actions">
        <button type="button" onClick={() => setPicking(true)}>
          {portrait.artId ? t.change : t.pick}
        </button>
        {portrait.artId && (
          <button type="button" onClick={() => onChange({ artId: null, tokenId: null })}>
            {t.remove}
          </button>
        )}
        {image.kind === "token" && <small className="muted">{t.token}</small>}
        {image.kind === "art" && <small className="muted">{t.art}</small>}
      </div>
      {image.kind === "missing" && <p className="warning">{t.missingHint}</p>}
      {picking && (
        <ArtPicker
          libraryRoot={libraryRoot}
          preferredSystem={preferredSystem}
          initialQuery={name}
          withTokens
          onPick={(art, token) => {
            setPicking(false);
            onChange({ artId: art.id, tokenId: token?.id ?? null });
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** Relations of a node, each opening its card. */
export function RelationList({ graph, nodeId }: { graph: RelationGraph; nodeId: string }) {
  const types = useRelationTypeStore((s) => s.types);
  const select = useRelationsStore((s) => s.select);
  const typeOf = typeLookup(types);
  const list = graph.relations.filter((r) => r.fromId === nodeId || r.toId === nodeId);
  const t = ru.relations;

  return (
    <section className="card-section">
      <h3 className="subheading">{t.character.relations}</h3>
      {list.length === 0 ? (
        <p className="muted">{t.character.noRelations}</p>
      ) : (
        <ul className="relation-list">
          {list.map((r) => {
            const type = typeOf(r.typeId);
            const outgoing = r.fromId === nodeId;
            const other = nodeName(graph, outgoing ? r.toId : r.fromId) ?? "—";
            const arrow = r.mutual
              ? t.relation.both
              : outgoing
                ? t.relation.arrow
                : t.relation.incoming;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className="relation-row"
                  onClick={() => select({ kind: "relation", id: r.id })}
                >
                  <span className="type-dot" style={{ background: type.color }} />
                  <span className="relation-type">{type.name}</span>
                  <span className="muted">{arrow}</span>
                  <span className="relation-other">{other}</span>
                  {r.label && <span className="muted relation-label">{r.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
