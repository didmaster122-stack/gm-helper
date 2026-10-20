import { fileUrl } from "../../shared/fs";
import { toAbsolute } from "./domain/paths";
import type { Token } from "./domain/types";

/** Image URL that changes when the token is re-rendered, so the webview does not show a stale file. */
export function tokenUrl(root: string, token: Token): string {
  return `${fileUrl(toAbsolute(root, token.relPath))}?v=${encodeURIComponent(token.updatedAt)}`;
}
