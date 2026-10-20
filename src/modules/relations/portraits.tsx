import { ru } from "../../shared/i18n/ru";
import { useThumbnail } from "../library";
import type { PortraitImage } from "./usePortraitResolver";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function ArtThumb({ path, hash }: { path: string; hash: string | null }) {
  const thumb = useThumbnail(path, hash);
  if (thumb.kind !== "ready") return <span className="portrait-placeholder" />;
  return <img src={thumb.url} alt="" draggable={false} crossOrigin="anonymous" />;
}

/** Round picture with fallbacks: initials when there is none, a warning when the file is gone. */
export function PortraitView({ image, name }: { image: PortraitImage; name: string }) {
  switch (image.kind) {
    case "token":
      return <img src={image.url} alt="" draggable={false} crossOrigin="anonymous" />;
    case "art":
      return <ArtThumb path={image.path} hash={image.hash} />;
    case "missing":
      return (
        <span className="portrait-placeholder missing" title={ru.relations.portrait.missing}>
          ?
        </span>
      );
    case "pending":
      return <span className="portrait-placeholder" />;
    case "none":
      return <span className="portrait-placeholder">{initials(name)}</span>;
  }
}
