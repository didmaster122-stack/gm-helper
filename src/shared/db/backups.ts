// Daily copies of the app database (spec §8.1). Pure: names, parsing and the pruning plan.

/** Automatic copies kept in the backups folder; older ones are removed. */
export const KEEP_AUTO_BACKUPS = 10;

export type BackupKind = "auto" | "before-restore";

const AUTO_RE = /^gm-helper-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/;
const RESTORE_RE = /^gm-helper-before-restore-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local time as "2026-10-21-190311": sorts by name, readable in Explorer. */
function stamp(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function backupFileName(kind: BackupKind, date: Date): string {
  return kind === "auto"
    ? `gm-helper-${stamp(date)}.db`
    : `gm-helper-before-restore-${stamp(date)}.db`;
}

export interface ParsedBackup {
  kind: BackupKind;
  /** Local time the copy was made. */
  date: Date;
}

/** Kind and time of a copy made by the app, or null for any other file. */
export function parseBackupName(name: string): ParsedBackup | null {
  const auto = AUTO_RE.exec(name);
  const match = auto ?? RESTORE_RE.exec(name);
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(y, mo - 1, d, h, mi, s);
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return { kind: auto ? "auto" : "before-restore", date };
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export interface AutoBackupPlan {
  /** Name of the copy to make now, or null if there is one for today already. */
  create: string | null;
  /** Automatic copies to remove so that `keep` remain (after the new one). */
  remove: string[];
}

/** What to do at startup given the names in the backups folder. */
export function planAutoBackup(
  names: readonly string[],
  now: Date,
  keep = KEEP_AUTO_BACKUPS,
): AutoBackupPlan {
  const autos = names
    .map((name) => ({ name, parsed: parseBackupName(name) }))
    .filter((b) => b.parsed?.kind === "auto")
    .sort((a, b) => (a.name < b.name ? 1 : -1));
  const hasToday = autos.some((b) => b.parsed && sameDay(b.parsed.date, now));
  const create = hasToday ? null : backupFileName("auto", now);
  const room = create ? keep - 1 : keep;
  return { create, remove: autos.slice(Math.max(room, 0)).map((b) => b.name) };
}
