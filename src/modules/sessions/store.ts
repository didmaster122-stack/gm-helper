import { create } from "zustand";
import { localDay } from "../../shared/dates";
import { getDb } from "../../shared/db";
import { ru } from "../../shared/i18n/ru";
import { refreshMentions } from "../../shared/mentions";
import { openSessionPlan } from "../notes";
import { saveRecapEvent } from "../timeline";
import * as domain from "./domain/sessions";
import type { ChangeSource, PrepItem, Session } from "./domain/types";
import * as repo from "./repo";

type Status = "idle" | "loading" | "ready" | "error";

interface SessionsState {
  /** Sessions are kept for the active campaign only. */
  campaignId: string | null;
  status: Status;
  sessions: Session[];
  load: (campaignId: string | null, force?: boolean) => Promise<void>;
  /** Adds a session with the next number. */
  schedule: (date?: string | null) => Promise<void>;
  setDate: (id: string, date: string | null) => Promise<void>;
  setNumber: (id: string, number: number) => Promise<void>;
  editItems: (id: string, edit: (items: readonly PrepItem[]) => PrepItem[]) => Promise<void>;
  markPlayed: (id: string) => Promise<void>;
  unmarkPlayed: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Opens (or creates) the plan note in the notes module and links it to the session. */
  openPlan: (id: string) => Promise<void>;
  /** The session whose recap dialog is open. */
  recapId: string | null;
  openRecap: (id: string | null) => void;
  /**
   * Saves the recap. With `onTimeline` the recap event of the session is added or updated;
   * without it the session lets its event go (the event stays on the timeline).
   */
  saveRecap: (id: string, recap: string, onTimeline: boolean) => Promise<void>;
}

const source = (): ChangeSource => ({
  now: new Date().toISOString(),
  newId: () => crypto.randomUUID(),
});

export const useSessionsStore = create<SessionsState>((set, get) => {
  function campaign(): string {
    const id = get().campaignId;
    if (!id) throw new Error("No campaign loaded");
    return id;
  }

  function find(id: string): Session {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) throw new Error(`Unknown session ${id}`);
    return session;
  }

  /** Saves the change, then shows it. */
  async function apply(change: domain.SessionChange): Promise<void> {
    const campaignId = get().campaignId;
    await repo.applyChange(await getDb(), change);
    if (get().campaignId !== campaignId) return;
    const put = new Map(change.put.map((s) => [s.id, s]));
    const kept = get()
      .sessions.filter((s) => !change.remove.includes(s.id))
      .map((s) => put.get(s.id) ?? s);
    const added = change.put.filter((s) => !kept.some((k) => k.id === s.id));
    set({ sessions: domain.sortSessions([...kept, ...added]) });
  }

  const putOne = (session: Session) => apply({ put: [session], remove: [] });

  return {
    campaignId: null,
    status: "idle",
    sessions: [],
    recapId: null,

    async load(campaignId, force = false) {
      if (get().campaignId === campaignId && !force && get().status === "ready") return;
      set({ campaignId, status: campaignId ? "loading" : "idle", sessions: [], recapId: null });
      if (!campaignId) return;
      try {
        const sessions = await repo.listSessions(await getDb(), campaignId);
        if (get().campaignId === campaignId) set({ sessions, status: "ready" });
      } catch (error) {
        console.error(error);
        if (get().campaignId === campaignId) set({ status: "error" });
      }
    },

    async schedule(date = null) {
      const number = domain.nextNumber(get().sessions);
      await putOne(domain.newSession(campaign(), number, source(), date));
    },

    async setDate(id, date) {
      await putOne(domain.update(find(id), { date }, source()));
    },

    async setNumber(id, number) {
      if (domain.numberError(get().sessions, id, number)) return;
      await putOne(domain.update(find(id), { number }, source()));
    },

    async editItems(id, edit) {
      const session = find(id);
      await putOne(domain.update(session, { items: edit(session.items) }, source()));
    },

    async markPlayed(id) {
      const change = domain.markPlayed(get().sessions, id, localDay(new Date()), source());
      await apply(change);
      // "Played" offers to write down what happened.
      if (change.put.some((s) => s.id === id)) set({ recapId: id });
    },

    async unmarkPlayed(id) {
      await apply(domain.unmarkPlayed(get().sessions, id, source()));
    },

    async remove(id) {
      await apply({ put: [], remove: [id] });
    },

    openRecap: (recapId) => set({ recapId }),

    async saveRecap(id, text, onTimeline) {
      const session = find(id);
      const recap = domain.cleanRecap(text);
      // An empty recap makes no event, but an event made before follows the text.
      const recapEventId =
        onTimeline && (recap !== "" || session.recapEventId !== null)
          ? await saveRecapEvent(session.campaignId, {
              eventId: session.recapEventId,
              session: session.number,
              title: ru.sessions.recap.eventTitle(session.number),
              description: recap,
            })
          : null;
      await putOne(domain.update(find(id), { recap, recapEventId }, source()));
      void refreshMentions();
    },

    async openPlan(id) {
      const session = find(id);
      const noteId = await openSessionPlan({
        campaignId: session.campaignId,
        noteId: session.planNoteId,
        title: ru.sessions.planTitle(session.number),
        tagName: ru.sessions.planTag(session.number),
      });
      if (noteId !== session.planNoteId) {
        await putOne(domain.update(find(id), { planNoteId: noteId }, source()));
      }
    },
  };
});
