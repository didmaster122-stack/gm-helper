// Art adapter over the shared catalog sync (shared/catalog/reconcile.ts).
import * as catalog from "../../../shared/catalog/reconcile";
import type { FoundFile, ResolveContext } from "../../../shared/catalog/reconcile";
import { classifyPath } from "./paths";
import type { Art, FileInspection } from "./types";

export { filesToInspect, hasChanges } from "../../../shared/catalog/reconcile";
export type { ResolveContext } from "../../../shared/catalog/reconcile";
export type ScanPlan = catalog.ScanPlan<Art>;
export type ScanChanges = catalog.ScanChanges<Art>;

const adapter: catalog.ReconcileAdapter<Art, FileInspection> = {
  update(art, file, info, now) {
    return {
      ...art,
      ...classifyPath(file.relPath),
      relPath: file.relPath,
      size: file.size,
      mtime: file.mtime,
      hash: info?.hash ?? art.hash,
      width: info?.width ?? art.width,
      height: info?.height ?? art.height,
      missing: false,
      updatedAt: now,
    };
  },
  create(file, info, ctx) {
    return {
      id: ctx.newId(),
      ...classifyPath(file.relPath),
      relPath: file.relPath,
      size: file.size,
      mtime: file.mtime,
      hash: info?.hash ?? null,
      width: info?.width ?? null,
      height: info?.height ?? null,
      displayName: null,
      tags: [],
      missing: false,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
  },
};

export function planScan(existing: readonly Art[], found: readonly FoundFile[]): ScanPlan {
  return catalog.planScan(existing, found);
}

export function resolveScan(
  plan: ScanPlan,
  inspected: ReadonlyMap<string, FileInspection>,
  ctx: ResolveContext,
): ScanChanges {
  return catalog.resolveScan(plan, inspected, ctx, adapter);
}
