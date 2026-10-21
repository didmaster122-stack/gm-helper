import { useEffect, useState } from "react";
import { ru } from "../i18n/ru";
import type { MentionKind, MentionTarget } from "./domain";
import { openMention, useMentionStore } from "./store";

interface MentionedInProps {
  kind: MentionKind;
  id: string;
}

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; list: MentionTarget[] };

/** "Где упоминается": notes and descriptions that mention the object, each opening it. */
export function MentionedIn({ kind, id }: MentionedInProps) {
  const services = useMentionStore((s) => s.services);
  const campaignId = useMentionStore((s) => s.campaignId);
  // Names and texts change elsewhere; the list follows every reload of the objects.
  const revision = useMentionStore((s) => s.revision);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!services || !campaignId) return;
    let alive = true;
    services
      .mentionedIn(campaignId, kind, id)
      .then((list) => {
        if (alive) setState({ kind: "ready", list });
      })
      .catch((e: unknown) => {
        console.error(e);
        if (alive) setState({ kind: "error" });
      });
    return () => {
      alive = false;
    };
  }, [services, campaignId, kind, id, revision]);

  const t = ru.mentions;
  return (
    <section className="card-section mentioned-in">
      <h3 className="subheading">{t.mentionedIn}</h3>
      {state.kind === "error" && <p className="muted">{t.loadFailed}</p>}
      {state.kind === "ready" &&
        (state.list.length === 0 ? (
          <p className="muted">{t.nowhere}</p>
        ) : (
          <ul className="mentioned-list">
            {state.list.map((source) => (
              <li key={source.id}>
                <button
                  type="button"
                  className="mentioned-row"
                  onClick={() => openMention(source.kind, source.id)}
                >
                  <span className="mentioned-title">{source.title}</span>
                  <span className="muted">{t.kinds[source.kind]}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
