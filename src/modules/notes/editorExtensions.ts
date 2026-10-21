import type { Extensions } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { toAbsolute } from "../../shared/catalog/paths";
import { fileUrl } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { MentionNode } from "../../shared/mentions";
import { isLibraryPath } from "./domain/doc";

/**
 * Converts between what the document stores for an image (a path relative to the library) and
 * what the webview loads (an asset URL). Copying an image inside the editor goes through HTML,
 * so the URL has to turn back into the path.
 */
export function libraryImageUrls(libraryRoot: string) {
  const base = `${toAbsolute(libraryRoot, "")}/`;
  const prefix = fileUrl(base);
  return {
    toUrl: (src: string) => (isLibraryPath(src) ? fileUrl(base + src) : src),
    toPath: (url: string) =>
      url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : url,
  };
}

export function noteExtensions(libraryRoot: string): Extensions {
  const urls = libraryImageUrls(libraryRoot);
  const NoteImage = Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        src: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const src = element.getAttribute("src");
            return src ? urls.toPath(src) : null;
          },
          renderHTML: (attributes: Record<string, unknown>) =>
            typeof attributes.src === "string" ? { src: urls.toUrl(attributes.src) } : {},
        },
      };
    },
  });
  return [
    // Links are left out: the app is offline and a click would navigate the window.
    StarterKit.configure({ link: false, heading: { levels: [1, 2, 3] } }),
    NoteImage.configure({
      resize: {
        enabled: true,
        directions: ["bottom-right", "bottom-left"],
        minWidth: 48,
        minHeight: 48,
        alwaysPreserveAspectRatio: true,
      },
    }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder: ru.notes.editor.placeholder }),
    MentionNode,
  ];
}
