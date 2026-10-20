import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useState } from "react";
import type { ImportItem } from "../../shared/catalog/importPlan";
import { joinRel } from "../../shared/catalog/paths";
import { ru } from "../../shared/i18n/ru";
import { prepareImport, runImport } from "./service";
import { useMusicStore } from "./store";

export interface PendingImport {
  folder: string;
  items: ImportItem[];
}

/** Files dropped onto the music screen are copied into the selected collection. */
export function useMusicDrop() {
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function execute(folder: string, items: ImportItem[], rename: boolean) {
    const { root, sync } = useMusicStore.getState();
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
  }

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

        const { root, selection } = useMusicStore.getState();
        if (!root) return;
        if (selection.kind !== "collection") {
          setNotice(ru.music.dropNeedCollection);
          return;
        }
        const folder = joinRel(selection.category, selection.collection);
        try {
          const items = await prepareImport(root, folder, payload.paths);
          if (items.some((i) => i.conflict)) setPending({ folder, items });
          else await execute(folder, items, false);
        } catch (error) {
          setNotice(String(error));
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return {
    dragging,
    pending,
    notice,
    clearNotice: () => setNotice(null),
    resolvePending: async (rename: boolean) => {
      if (pending) await execute(pending.folder, pending.items, rename);
    },
    cancelPending: () => setPending(null),
  };
}
