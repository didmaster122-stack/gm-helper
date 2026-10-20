import { planImport as planCatalogImport } from "../../../shared/catalog/importPlan";
import type { ImportItem } from "../../../shared/catalog/importPlan";
import { isSupportedImage } from "./paths";

export { baseName } from "../../../shared/catalog/importPlan";
export type { ImportItem };

/** Decides target names for images copied into a folder that already contains `existing`. */
export function planImport(sources: readonly string[], existing: readonly string[]): ImportItem[] {
  return planCatalogImport(sources, existing, isSupportedImage);
}
