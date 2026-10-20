import { useEffect, useMemo, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import { EmptyState, Modal } from "../../shared/ui";
import { ArtGrid } from "./ArtGrid";
import { searchArts, type TokenFilter } from "./domain/search";
import type { Art, LibrarySelection, Token } from "./domain/types";
import { LibraryTree } from "./LibraryTree";
import { useLibraryStore } from "./store";
import { TokenImage } from "./TokensSection";

interface ArtPickerProps {
  libraryRoot: string;
  /** Campaign system: searched first, with a switch to the whole library. */
  preferredSystem: string | null;
  initialQuery?: string;
  /** Lets the user pick one of the art's tokens instead of the art (the first token by default). */
  withTokens?: boolean;
  /** `token` is null when the art itself was chosen. */
  onPick: (art: Art, token: Token | null) => void;
  onClose: () => void;
}

const NO_TOKENS: Token[] = [];
const TOKEN_FILTERS: readonly TokenFilter[] = ["any", "with", "without"];

/** Modal art search shared by other modules (e.g. picking a character portrait). */
export function ArtPicker({
  libraryRoot,
  preferredSystem,
  initialQuery = "",
  withTokens = false,
  onPick,
  onClose,
}: ArtPickerProps) {
  const open = useLibraryStore((s) => s.open);
  const entries = useLibraryStore((s) => s.entries);
  const tree = useLibraryStore((s) => s.tree);
  const syncing = useLibraryStore((s) => s.syncing);
  const tokensByArt = useLibraryStore((s) => s.tokensByArt);
  const [query, setQuery] = useState(initialQuery);
  const [selection, setSelection] = useState<LibrarySelection | null>(null);
  const [tokenFilter, setTokenFilter] = useState<TokenFilter>("any");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void open(libraryRoot);
  }, [open, libraryRoot]);

  // The campaign's system is opened first; "All arts" in the tree is the whole library.
  const hasSystem = !!preferredSystem && tree.systems.some((s) => s.name === preferredSystem);
  const current = useMemo<LibrarySelection>(
    () =>
      selection ??
      (hasSystem && preferredSystem
        ? { kind: "system", system: preferredSystem }
        : { kind: "all" }),
    [selection, hasSystem, preferredSystem],
  );
  const results = useMemo(
    () =>
      searchArts(entries, query, current, {
        filter: tokenFilter,
        artsWithTokens: new Set(tokensByArt.keys()),
      }),
    [entries, query, current, tokenFilter, tokensByArt],
  );
  const selected = results.find((a) => a.id === selectedId) ?? null;
  const tokens = (withTokens && selected && tokensByArt.get(selected.id)) || NO_TOKENS;
  // Chosen variant of the selected art (tokenId null = the art itself); the first token by default.
  const [variant, setVariant] = useState<{ artId: string; tokenId: string | null } | null>(null);
  const chosenToken =
    variant && variant.artId === selected?.id
      ? (tokens.find((t) => t.id === variant.tokenId) ?? null)
      : (tokens[0] ?? null);

  const pick = (art: Art) => {
    const token =
      art.id === selected?.id
        ? chosenToken
        : withTokens
          ? (tokensByArt.get(art.id)?.[0] ?? null)
          : null;
    onPick(art, token);
  };

  return (
    <Modal
      title={ru.library.picker.title}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose}>
            {ru.common.cancel}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!selected}
            onClick={() => selected && pick(selected)}
          >
            {ru.library.picker.choose}
          </button>
        </>
      }
    >
      <div className="picker-toolbar">
        <input
          type="search"
          placeholder={ru.library.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <select
          value={tokenFilter}
          onChange={(e) => setTokenFilter(TOKEN_FILTERS.find((f) => f === e.target.value) ?? "any")}
          aria-label={ru.library.filter.label}
        >
          {TOKEN_FILTERS.map((f) => (
            <option key={f} value={f}>
              {ru.library.filter[f]}
            </option>
          ))}
        </select>
        <span className="muted">{ru.library.count(results.length)}</span>
      </div>
      <div className="picker-body">
        <LibraryTree browse={{ selection: current, onSelect: setSelection }} />
        <div className="picker-grid">
          {results.length > 0 ? (
            <ArtGrid
              root={libraryRoot}
              arts={results}
              selectedId={selectedId}
              onSelect={(art) => setSelectedId(art.id)}
              onActivate={pick}
              tokensByArt={withTokens ? tokensByArt : undefined}
            />
          ) : (
            !syncing && (
              <EmptyState
                title={ru.library.emptyTitle}
                text={query.trim() ? ru.library.noResults(query.trim()) : ru.library.emptySelection}
              />
            )
          )}
        </div>
      </div>
      {selected && tokens.length > 0 && (
        <div className="picker-variants">
          <span className="muted">{ru.library.picker.variant}</span>
          <button
            type="button"
            className={chosenToken === null ? "picker-variant active" : "picker-variant"}
            onClick={() => setVariant({ artId: selected.id, tokenId: null })}
          >
            {ru.library.picker.wholeArt}
          </button>
          {tokens.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={
                chosenToken?.id === t.id ? "token-thumb small active" : "token-thumb small"
              }
              title={ru.library.picker.tokenOption(i + 1)}
              onClick={() => setVariant({ artId: selected.id, tokenId: t.id })}
            >
              <TokenImage root={libraryRoot} token={t} />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
