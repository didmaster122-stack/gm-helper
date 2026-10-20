import { useEffect, useState } from "react";
import { getDb } from "../../shared/db";
import { ru } from "../../shared/i18n/ru";
import { Plus, Trash } from "lucide-react";
import { Button, ColorInput, ConfirmDialog, IconButton } from "../../shared/ui";
import { LINE_STYLES, type LineStyle, type RelationType } from "./domain/types";
import { useRelationTypeStore } from "./relationTypeStore";
import { countRelationsOfType } from "./repo";
import { useRelationsStore } from "./store";

function LinePreview({ type }: { type: RelationType }) {
  const dash =
    type.lineStyle === "dashed" ? "8 5" : type.lineStyle === "dotted" ? "1 5" : undefined;
  return (
    <svg className="line-preview" width="48" height="12" aria-hidden>
      <line
        x1="2"
        y1="6"
        x2="46"
        y2="6"
        stroke={type.color}
        strokeWidth="2.5"
        strokeDasharray={dash}
        strokeLinecap={type.lineStyle === "dotted" ? "round" : undefined}
      />
    </svg>
  );
}

/** Settings section: relation types (spec §4.3). */
export function RelationTypesSettings() {
  const types = useRelationTypeStore((s) => s.types);
  const load = useRelationTypeStore((s) => s.load);
  const create = useRelationTypeStore((s) => s.create);
  const update = useRelationTypeStore((s) => s.update);
  const remove = useRelationTypeStore((s) => s.remove);
  const [deleting, setDeleting] = useState<{ type: RelationType; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = ru.relations.types;

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(String(e));
    }
  }

  const save = (type: RelationType, patch: Partial<Omit<RelationType, "id" | "builtin">>) =>
    run(() =>
      update(type.id, {
        name: patch.name ?? type.name,
        color: patch.color ?? type.color,
        lineStyle: patch.lineStyle ?? type.lineStyle,
      }),
    );

  return (
    <>
      <p className="muted">{t.builtinHint}</p>
      <ul className="row-list type-list">
        {types.map((type) => (
          <li key={type.id}>
            <LinePreview type={type} />
            <input
              key={type.name}
              className="type-name-input"
              defaultValue={type.name}
              aria-label={t.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name === "") e.target.value = type.name;
                else if (name !== type.name) void save(type, { name });
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <div className="row-actions">
              <ColorInput
                key={type.color}
                value={type.color}
                title={t.color}
                onCommit={(color) => void save(type, { color })}
              />
              <select
                value={type.lineStyle}
                aria-label={t.lineStyle}
                onChange={(e) =>
                  void save(type, {
                    lineStyle:
                      LINE_STYLES.find((s) => s === e.target.value) ?? ("solid" as LineStyle),
                  })
                }
              >
                {LINE_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {t.lineStyles[s]}
                  </option>
                ))}
              </select>
              {!type.builtin && (
                <IconButton
                  icon={Trash}
                  label={ru.common.delete}
                  className="danger"
                  onClick={() =>
                    void run(async () =>
                      setDeleting({
                        type,
                        count: await countRelationsOfType(await getDb(), type.id),
                      }),
                    )
                  }
                />
              )}
            </div>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        icon={Plus}
        className="list-add"
        onClick={() =>
          void run(() => create({ name: t.newName, color: "#8fb3a0", lineStyle: "solid" }))
        }
      >
        {t.add}
      </Button>
      {error && <p className="error">{error}</p>}

      {deleting && (
        <ConfirmDialog
          title={t.deleteTitle}
          text={t.deleteText(deleting.type.name, deleting.count)}
          confirmLabel={ru.common.delete}
          danger
          onConfirm={async () => {
            await remove(deleting.type.id);
            // Relations of the type became "unknown" in the database.
            const campaignId = useRelationsStore.getState().campaignId;
            if (campaignId) await useRelationsStore.getState().load(campaignId, true);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
