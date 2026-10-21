import { describe, expect, it } from "vitest";
import {
  daysBetween,
  formatDay,
  formatDistance,
  formatMoment,
  formatWeekday,
  isDay,
  localDay,
} from "./dates";

describe("dates", () => {
  it("checks calendar days", () => {
    expect(isDay("2026-10-24")).toBe(true);
    expect(isDay("2026-02-30")).toBe(false);
    expect(isDay("2026-10-24T00:00:00Z")).toBe(false);
  });

  it("takes the local day of a moment", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("counts days across months and years", () => {
    expect(daysBetween("2026-10-21", "2026-10-24")).toBe(3);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-10-24", "2026-10-21")).toBe(-3);
    // Across the March DST change.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("formats days near today in words, others by the calendar", () => {
    const today = "2026-10-21";
    expect(formatDay("2026-10-21", today)).toBe("сегодня");
    expect(formatDay("2026-10-20", today)).toBe("вчера");
    expect(formatDay("2026-10-22", today)).toBe("завтра");
    expect(formatDay("2026-10-19", today)).toBe("19 окт");
    expect(formatDay("2026-05-02", today)).toBe("2 мая");
    expect(formatDay("2025-05-02", today)).toBe("май 2025");
    expect(formatDay("2027-01-09", today)).toBe("9 янв 2027");
  });

  it("formats a day with its weekday", () => {
    expect(formatWeekday("2026-10-24", "2026-10-21")).toBe("суббота, 24 окт");
  });

  it("formats moments with the time for today", () => {
    const now = new Date(2026, 9, 21, 23, 0);
    expect(formatMoment(new Date(2026, 9, 21, 22, 40).toISOString(), now)).toBe("сегодня, 22:40");
    expect(formatMoment(new Date(2026, 9, 20, 9, 0).toISOString(), now)).toBe("вчера");
    expect(formatMoment(new Date(2026, 9, 19, 9, 0).toISOString(), now)).toBe("19 окт");
  });

  it("says how far a day is, with Russian plurals", () => {
    const today = "2026-10-21";
    expect(formatDistance("2026-10-21", today)).toBe("сегодня");
    expect(formatDistance("2026-10-22", today)).toBe("завтра");
    expect(formatDistance("2026-10-24", today)).toBe("через 3 дня");
    expect(formatDistance("2026-10-26", today)).toBe("через 5 дней");
    expect(formatDistance("2026-11-11", today)).toBe("через 21 день");
    expect(formatDistance("2026-11-02", today)).toBe("через 12 дней");
    expect(formatDistance("2026-10-18", today)).toBe("3 дня назад");
  });
});
