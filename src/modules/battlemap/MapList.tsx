import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleAlert,
  Grid3x3,
  LayoutTemplate,
  Map as MapIcon,
  Pencil,
  Plus,
  SearchX,
  Trash,
  Upload,
  X,
} from "lucide-react";
import { pickFile, readChosenFile } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FilterChips,
  IconButton,
  ScreenHeader,
  SearchInput,
} from "../../shared/ui";
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

  return (
    <div className="screen wide map-list-screen">
      <ScreenHeader
        title={ru.battlemap.title}
        path={[campaign.name]}
        summary={ru.battlemap.gallery.summary(maps.length, templates.length)}
        actions={
          <>
            <SearchInput
              wrapperClassName="gallery-search"
              screenSearch
              placeholder={ru.battlemap.gallery.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button icon={Upload} onClick={() => void importFile()}>
              {ru.battlemap.import.button}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setForm({ kind: "new" })}>
              {ru.battlemap.newMap}
            </Button>
          </>
        }
      />
      <div className="screen-tools">
        <FilterChips
          label={ru.battlemap.gallery.tabsLabel}
          value={tab}
          onChange={setTab}
          options={(["maps", "templates"] as const satisfies readonly GalleryTab[]).map((t) => ({
            value: t,
            label: ru.battlemap.gallery.tabs[t],
          }))}
        />
      </div>
      {error && (
        <div className="notice error">
          <CircleAlert aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="notice">
          <Check aria-hidden />
          <span>{notice}</span>
          <IconButton icon={X} size="sm" label={ru.common.close} onClick={() => setNotice(null)} />
        </div>
      )}

      {list.length === 0 ? (
        tab === "maps" ? (
          <EmptyState
            icon={MapIcon}
            title={ru.battlemap.emptyTitle}
            text={ru.battlemap.emptyText}
          />
        ) : (
          <EmptyState
            icon={LayoutTemplate}
            title={ru.battlemap.templates.emptyTitle}
            text={ru.battlemap.templates.emptyText}
          />
        )
      ) : shown.length === 0 ? (
        <EmptyState compact icon={SearchX} title={ru.battlemap.gallery.noResults(query.trim())} />
      ) : (
        <ul className={`map-gallery ${tab}`}>
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
                    <Grid3x3 aria-hidden />
                  </span>
                )}
                <span className="map-card-size badge">
                  {ru.battlemap.sizeCells(m.width, m.height)}
                </span>
              </button>
              <div className="map-card-body">
                <strong className="map-card-title">{m.name}</strong>
                {m.description && <p className="muted map-card-desc">{m.description}</p>}
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
                <div className="map-card-actions">
                  {tab === "templates" ? (
                    <Button
                      size="sm"
                      icon={Plus}
                      onClick={() => setForm({ kind: "fromTemplate", template: m })}
                    >
                      {ru.battlemap.templates.createMap}
                    </Button>
                  ) : (
                    <IconButton
                      size="sm"
                      icon={LayoutTemplate}
                      label={ru.battlemap.templates.saveAs}
                      onClick={() => void toTemplate(m)}
                    />
                  )}
                  <span className="spacer" />
                  <IconButton
                    size="sm"
                    icon={Pencil}
                    label={ru.common.change}
                    onClick={() => setForm({ kind: "edit", map: m })}
                  />
                  <IconButton
                    size="sm"
                    icon={Trash}
                    label={ru.common.delete}
                    className="danger"
                    onClick={() => setDeleting(m)}
                  />
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
