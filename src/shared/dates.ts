// The one date format of the interface. Moments are ISO 8601 in UTC; calendar days (a session
// date) are "YYYY-MM-DD" in local time, so "Saturday" stays Saturday in any time zone.
import { ru } from "./i18n/ru";

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar day of a moment. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Year, month (0-based) and day of a "YYYY-MM-DD" string, or null if it is not a real day. */
function splitDay(day: string): [number, number, number] | null {
  const m = DAY_RE.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const check = new Date(Date.UTC(y, mo, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo || check.getUTCDate() !== d) {
    return null;
  }
  return [y, mo, d];
}

export function isDay(value: string): boolean {
  return splitDay(value) !== null;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = splitDay(from);
  const b = splitDay(to);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(...b) - Date.UTC(...a)) / DAY_MS);
}

/** "19 окт" this year, "май 2025" for past years, "19 окт 2027" for later ones. */
function calendarLabel(y: number, mo: number, d: number, currentYear: number): string {
  if (y === currentYear) return `${d} ${ru.dates.monthsShort[mo] ?? ""}`;
  if (y < currentYear) return `${ru.dates.months[mo] ?? ""} ${y}`;
  return `${d} ${ru.dates.monthsShort[mo] ?? ""} ${y}`;
}

/** A calendar day: "сегодня", "вчера", "завтра", "19 окт", "май 2025". */
export function formatDay(day: string, today: string): string {
  const parts = splitDay(day);
  const now = splitDay(today);
  if (!parts || !now) return day;
  const diff = daysBetween(today, day);
  if (diff === 0) return ru.dates.today;
  if (diff === -1) return ru.dates.yesterday;
  if (diff === 1) return ru.dates.tomorrow;
  return calendarLabel(...parts, now[0]);
}

/** A day with its weekday, always absolute: "суббота, 24 окт". */
export function formatWeekday(day: string, today: string): string {
  const parts = splitDay(day);
  const now = splitDay(today);
  if (!parts || !now) return day;
  const weekday = ru.dates.weekdays[new Date(Date.UTC(...parts)).getUTCDay()] ?? "";
  return `${weekday}, ${calendarLabel(...parts, now[0])}`;
}

/** A moment: "сегодня, 22:40", "вчера", "19 окт", "май 2025". */
export function formatMoment(iso: string, now: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = localDay(date);
  if (day === localDay(now)) {
    return ru.dates.todayAt(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
  }
  return formatDay(day, localDay(now));
}

/** How far a day is: "сегодня", "завтра", "через 4 дня", "вчера", "3 дня назад". */
export function formatDistance(day: string, today: string): string {
  const diff = daysBetween(today, day);
  if (diff === 0) return ru.dates.today;
  if (diff === 1) return ru.dates.tomorrow;
  if (diff === -1) return ru.dates.yesterday;
  return diff > 0 ? ru.dates.inDays(diff) : ru.dates.daysAgo(-diff);
}
