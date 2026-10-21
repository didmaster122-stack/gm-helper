import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCallback, useEffect, useState } from "react";
import { ru } from "../../shared/i18n/ru";
import type { ImportItem } from "./domain/importPlan";
import { joinRel } from "./domain/paths";
import { prepareImport, runImport } from "./service";
import { useLibraryStore } from "./store";

export interface PendingImport {
  folder: string;
  items: ImportItem[];
}

/**
 * Files dropped onto the window (or picked with `importPaths`) are copied into the selected group.
 * Returns drag state, a pending import with conflicts (needs a dialog) and a status message.
 */
export function useDropImport() {
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const execute = useCallback(async (folder: string, items: ImportItem[], rename: boolean) => {
    const { root, sync } = useLibraryStore.getState();
    if (!root) return;
    const { copied, failed } = await runImport(root, folder, items, rename);
    const unsupported = items.filter((i) => i.unsupported).length;
    setNotice(
      [
        ru.catalog.import.done(copied),
        failed.length > 0 && ru.catalog.import.failed(failed.length),
        unsupported > 0 && ru.catalog.import.unsupported(unsupported),
      ]
        .filter(Boolean)
        .join(" · "),
    );
    await sync();
  }, []);

  /** Copies files into the selected group, asking about name conflicts first. */
  const importPaths = useCallback(
    async (paths: readonly string[]) => {
      const { root, selection } = useLibraryStore.getState();
      if (!root || paths.length === 0) return;
      if (selection.kind !== "group") {
        setNotice(ru.library.dropNeedGroup);
        return;
      }
      const folder = joinRel(selection.system, selection.group);
      try {
        const items = await prepareImport(root, folder, paths);
        if (items.some((i) => i.conflict)) setPending({ folder, items });
        else await execute(folder, items, false);
      } catch (error) {
        setNotice(String(error));
      }
    },
    [execute],
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent(async ({ payload }) => {
        if (payload.type === "enter" || payload.type === "over") {
          setDragging(true);
          return;
        }
        setDragging(false);
        if (payload.type !== "drop" || payload.paths.length === 0) return;

        await importPaths(payload.paths);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [importPaths]);

  return {
    dragging,
    pending,
    notice,
    importPaths,
    clearNotice: () => setNotice(null),
    resolvePending: async (rename: boolean) => {
      if (pending) await execute(pending.folder, pending.items, rename);
    },
    cancelPending: () => setPending(null),
  };
}
