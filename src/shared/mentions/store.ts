// Objects of the active campaign that can be mentioned, and what the app does with a mention.
// The app wires the services (it knows every module); editors and cards only read this store.
import { create } from "zustand";
import type {
  MentionKind,
  MentionRef,
  MentionSource,
  MentionSourceKind,
  MentionTarget,
} from "./domain";

export interface MentionServices {
  /** Everything of the campaign that can be mentioned. */
  load: (campaignId: string) => Promise<MentionTarget[]>;
  /** Shows the object (or the session recap) in its section. */
  open: (kind: MentionSourceKind, id: string) => void | Promise<void>;
  /** Notes, descriptions and recaps of the campaign that mention the object. */
  mentionedIn: (campaignId: string, kind: MentionKind, id: string) => Promise<MentionSource[]>;
}

interface MentionState {
  services: MentionServices | null;
  campaignId: string | null;
  /** The targets belong to `campaignId` (until then names are not known). */
  loaded: boolean;
  targets: MentionTarget[];
  byId: ReadonlyMap<string, MentionTarget>;
  /** Grows on every reload, so lists of mentions can load again. */
  revision: number;
}

export const useMentionStore = create<MentionState>(() => ({
  services: null,
  campaignId: null,
  loaded: false,
  targets: [],
  byId: new Map(),
  revision: 0,
}));

let request = 0;

/** Loads the objects again (names change in other sections). */
export async function refreshMentions(): Promise<void> {
  const { services, campaignId } = useMentionStore.getState();
  if (!services || !campaignId) return;
  const current = ++request;
  try {
    const targets = await services.load(campaignId);
    if (current !== request) return;
    useMentionStore.setState((s) => ({
      targets,
      byId: new Map(targets.map((t) => [t.id, t])),
      loaded: true,
      revision: s.revision + 1,
    }));
  } catch (e) {
    console.error(e);
  }
}

export function configureMentions(services: MentionServices): void {
  useMentionStore.setState({ services });
  void refreshMentions();
}

export function setMentionCampaign(campaignId: string | null): void {
  if (useMentionStore.getState().campaignId === campaignId) return;
  useMentionStore.setState({ campaignId, loaded: false, targets: [], byId: new Map() });
  void refreshMentions();
}

/**
 * The current name of the mentioned object: `null` when it is gone, `undefined` while the
 * objects are not loaded yet.
 */
export function mentionTitle(id: string): string | null | undefined {
  const { loaded, byId } = useMentionStore.getState();
  if (!loaded) return undefined;
  return byId.get(id)?.title ?? null;
}

/** The name to show and to search by: the current one, or the saved one. */
export function mentionName(ref: MentionRef): string {
  return mentionTitle(ref.id) ?? ref.label;
}

/** Opens a text that has the mention, from "Где упоминается". */
export function openMentionSource(source: MentionSource): void {
  const services = useMentionStore.getState().services;
  if (!services) return;
  void Promise.resolve(services.open(source.kind, source.id)).catch((e: unknown) =>
    console.error(e),
  );
}

export function openMention(kind: MentionKind, id: string): void {
  const services = useMentionStore.getState().services;
  if (!services || mentionTitle(id) === null) return;
  void Promise.resolve(services.open(kind, id)).catch((e: unknown) => console.error(e));
}
