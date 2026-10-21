import type { CSSProperties } from "react";
import { toAbsolute, useLibraryStore, useThumbnail } from "../library";
import { coverHue } from "./cover";

interface CampaignCoverProps {
  name: string;
  coverArtId: string | null;
  libraryRoot: string | null;
  className?: string;
}

/** The cover art of a campaign, or a gradient from its name when there is none (or it is gone). */
export function CampaignCover({ name, coverArtId, libraryRoot, className }: CampaignCoverProps) {
  const root = useLibraryStore((s) => s.root);
  const art = useLibraryStore((s) =>
    coverArtId ? s.arts.find((a) => a.id === coverArtId && !a.missing) : undefined,
  );
  const usable = art && libraryRoot && root === libraryRoot ? art : undefined;
  const thumb = useThumbnail(
    usable && libraryRoot ? toAbsolute(libraryRoot, usable.relPath) : null,
    usable?.hash ?? null,
  );
  const style = { "--cover-hue": coverHue(name) } as CSSProperties;
  return (
    <div className={className ? `campaign-cover ${className}` : "campaign-cover"} style={style}>
      {thumb.kind === "ready" && <img src={thumb.url} alt="" />}
    </div>
  );
}
