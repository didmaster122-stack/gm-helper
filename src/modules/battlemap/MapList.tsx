import { useEffect, useMemo, useState } from "react";
import { pickFile, readChosenFile } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { ConfirmDialog, EmptyState } from "../../shared/ui";
import type { Campaign } from "../campaigns";
import { useCellTypeStore } from "./cellTypeStore";
import { parseGmmapFile } from "./domain/gmmapFile";
import { searchMaps } from "./domain/mapSearch";
import { MapForm } from "./MapForm";
import { useObjectStore } from "./objectStore";
import type { BattlemapSummary } from "./repo";
import { useEditorStore, useMapListStore, type GalleryTab } from "./store";

const NO_MAPS: BattlemapSummary[] = [];

type Form =
  | { kind: "new" }
  | { kind: "edit"; map: BattlemapSummary }
  | { kind: "fromTemplate"; template: BattlemapSummary };

/** Gallery of the campaign's maps and of the templates shared by all campaigns. */
export function MapList({ campaign }: { campaign: Campaign }) {
  // A stable empty array: a new one on every call would re-render forever.
  const maps = useMapListStore((s) => (s.campaignId === campaign.id ? s.maps : NO_MAPS));
  const templates = useMapListStore((s) => s.templates);
  const tab = useMapListStore((s) => s.tab);
  const setTab = useMapListStore((s) => s.setTab);
  const load = useMapListStore((s) => s.load);
  const remove = useMapListStore((s) => s.remove);
  const create = useMapListStore((s) => s.create);
  const saveAsTemplate = useMapListStore((s) => s.saveAsTemplate);
  const openById = useEditorStore((s) => s.openById);
  const importTypes = useCellTypeStore((s) => s.importMissing);
  const importObjects = useObjectStore((s) => s.importMissing);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [deleting, setDeleting] = useState<BattlemapSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void load(campaign.id);
  }, [campaign.id, load]);

  const list = tab === "maps" ? maps : templates;
  const shown = useMemo(() => searchMaps(list, query), [list, query]);

  async function open(id: string) {
    setError(null);
    try {
      await openById(id);
    } catch (e) {
      console.error(e);
      setError(ru.battlemap.loadError);
    }
  }

  async function importFile() {
    setError(null);
    const path = await pickFile(ru.battlemap.import.title, [
      { name: ru.battlemap.export.gmmapFilter, extensions: ["json"] },
    ]);
    if (!path) return;
    try {
      const content = parseGmmapFile(new TextDecoder().decode(await readChosenFile(path)));
      await importTypes(content.customTypes);
      await importObjects(content.objects);
      const info = {
        name: content.name || ru.battlemap.import.defaultName,
        description: content.description,
        tags: [],
      };
      const created = await create(campaign.id, info, content.model);
      setTab("maps");
      await open(created.id);
    } catch (e) {
      console.error(e);
      setError(ru.battlemap.import.failed);
    }
  }

  async function toTemplate(map: BattlemapSummary) {
    setError(null);
    try {
      await saveAsTemplate(map.id);
      setNotice(ru.battlemap.templates.saved);
    } catch (e) {
      console.error(e);
      setError(ru.battlemap.templates.saveFailed);
    }
  }

  const actions = (
    <div className="row-actions">
      {tab === "maps" && (
        <>
          <button type="button" onClick={() => void importFile()}>
            {ru.battlemap.import.button}
          </button>
          <button type="button" className="primary" onClick={() => setForm({ kind: "new" })}>
            {ru.battlemap.newMap}
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="screen map-list-screen">
      <div className="screen-heading">
        <h1>{ru.battlemap.title}</h1>
        <div className="segmented">
          {(["maps", "templates"] as const satisfies readonly GalleryTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? "active" : undefined}
              onClick={() => setTab(t)}
            >
              {ru.battlemap.gallery.tabs[t]}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="gallery-search"
          placeholder={ru.battlemap.gallery.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="spacer" />
        {actions}
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice-text">{notice}</p>}

      {list.length === 0 ? (
        tab === "maps" ? (
          <EmptyState title={ru.battlemap.emptyTitle} text={ru.battlemap.emptyText} />
        ) : (
          <EmptyState
            title={ru.battlemap.templates.emptyTitle}
            text={ru.battlemap.templates.emptyText}
          />
        )
      ) : shown.length === 0 ? (
        <p className="muted">{ru.battlemap.gallery.noResults(query.trim())}</p>
      ) : (
        <ul className="map-gallery">
          {shown.map((m) => (
            <li key={m.id} className="map-card">
              <button
                type="button"
                className="map-card-open"
                title={ru.battlemap.open}
                onClick={() => void open(m.id)}
              >
                {m.preview ? (
                  <img className="map-card-preview" src={m.preview} alt="" />
                ) : (
                  <span className="map-card-preview empty">
                    {ru.battlemap.sizeCells(m.width, m.height)}
                  </span>
                )}
              </button>
              <div className="map-card-body">
                <div className="map-card-title">
                  <strong>{m.name}</strong>
                  <span className="muted">{ru.battlemap.sizeCells(m.width, m.height)}</span>
                </div>
                {m.tags.length > 0 && (
                  <div className="map-card-tags">
                    {m.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="tag"
                        title={ru.battlemap.gallery.searchTag}
                        onClick={() => setQuery(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
                {m.description && <p className="muted map-card-desc">{m.description}</p>}
                <div className="row-actions">
                  {tab === "templates" ? (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setForm({ kind: "fromTemplate", template: m })}
                    >
                      {ru.battlemap.templates.createMap}
                    </button>
                  ) : (
                    <button type="button" onClick={() => void toTemplate(m)}>
                      {ru.battlemap.templates.saveAs}
                    </button>
                  )}
                  <button type="button" onClick={() => setForm({ kind: "edit", map: m })}>
                    {ru.common.change}
                  </button>
                  <button type="button" className="danger" onClick={() => setDeleting(m)}>
                    {ru.common.delete}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <MapForm
          campaignId={campaign.id}
          mode={form}
          onCreated={(m) => {
            setTab("maps");
            void open(m.id);
          }}
          onClose={() => setForm(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={
            deleting.isTemplate ? ru.battlemap.templates.deleteTitle : ru.battlemap.deleteTitle
          }
          text={
            deleting.isTemplate
              ? ru.battlemap.templates.deleteText(deleting.name)
              : ru.battlemap.deleteText(deleting.name)
          }
          confirmLabel={ru.common.delete}
          danger
          onConfirm={() => remove(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
