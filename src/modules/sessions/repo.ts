import { runScript, sqlLiteral } from "../../shared/db/script";
import type { Db } from "../../shared/db/types";
import { mentionsInText } from "../../shared/mentions/domain";
import type { SessionChange } from "./domain/sessions";
import type { PrepItem, Session } from "./domain/types";

interface SessionRow {
  id: string;
  campaign_id: string;
  number: number;
  date: string | null;
  played: number;
  plan_note_id: string | null;
  recap: string;
  recap_event_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  session_id: string;
  text: string;
  done: number;
}

export async function listSessions(db: Db, campaignId: string): Promise<Session[]> {
  const [rows, items] = await Promise.all([
    db.select<SessionRow>("SELECT * FROM sessions WHERE campaign_id = ? ORDER BY number", [
      campaignId,
    ]),
    db.select<ItemRow>(
      `SELECT i.id, i.session_id, i.text, i.done FROM session_prep_items i
       JOIN sessions s ON s.id = i.session_id
       WHERE s.campaign_id = ? ORDER BY i.position`,
      [campaignId],
    ),
  ]);
  const bySession = new Map<string, PrepItem[]>();
  for (const i of items) {
    const list = bySession.get(i.session_id) ?? [];
    list.push({ id: i.id, text: i.text, done: i.done !== 0 });
    bySession.set(i.session_id, list);
  }
  return rows.map((r) => toSession(r, bySession.get(r.id) ?? []));
}

/** Sessions of every campaign, without their checklists (for summaries of campaigns). */
export async function listAllSessions(db: Db): Promise<Session[]> {
  const rows = await db.select<SessionRow>("SELECT * FROM sessions ORDER BY number");
  return rows.map((r) => toSession(r, []));
}

function toSession(r: SessionRow, items: PrepItem[]): Session {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    number: r.number,
    date: r.date,
    played: r.played !== 0,
    planNoteId: r.plan_note_id,
    recap: r.recap,
    recapEventId: r.recap_event_id,
    items,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Sessions of the campaign whose recap mentions the object. */
export async function sessionsMentioning(
  db: Db,
  campaignId: string,
  id: string,
): Promise<{ id: string; number: number; recapEventId: string | null }[]> {
  const rows = await db.select<SessionRow>(
    "SELECT * FROM sessions WHERE campaign_id = ? AND instr(recap, ?) > 0 ORDER BY number",
    [campaignId, id],
  );
  return rows
    .filter((r) => mentionsInText(r.recap).some((m) => m.id === id))
    .map((r) => ({ id: r.id, number: r.number, recapEventId: r.recap_event_id }));
}

/** Writes the session with its checklist, replacing what was stored. */
export function sessionStatements(session: Session): string[] {
  const id = sqlLiteral(session.id);
  const values = [
    session.id,
    session.campaignId,
    session.number,
    session.date,
    session.played,
    session.planNoteId,
    session.recap,
    session.recapEventId,
    session.createdAt,
    session.updatedAt,
  ].map(sqlLiteral);
  return [
    `INSERT OR REPLACE INTO sessions
      (id, campaign_id, number, date, played, plan_note_id, recap, recap_event_id,
       created_at, updated_at)
      VALUES (${values.join(", ")})`,
    `DELETE FROM session_prep_items WHERE session_id = ${id}`,
    ...session.items.map((item, position) => {
      const row = [item.id, session.id, item.text, item.done, position].map(sqlLiteral);
      return `INSERT INTO session_prep_items (id, session_id, text, done, position)
        VALUES (${row.join(", ")})`;
    }),
  ];
}

export function sessionDeleteStatements(id: string): string[] {
  const key = sqlLiteral(id);
  return [
    `DELETE FROM session_prep_items WHERE session_id = ${key}`,
    `DELETE FROM sessions WHERE id = ${key}`,
  ];
}

export async function applyChange(db: Db, change: SessionChange): Promise<void> {
  if (change.put.length === 0 && change.remove.length === 0) return;
  await runScript(db, [
    ...change.remove.flatMap(sessionDeleteStatements),
    ...change.put.flatMap(sessionStatements),
  ]);
}
