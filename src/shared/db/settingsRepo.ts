import type { Db } from "./types";

export type SettingKey = "libraryRoot" | "activeCampaignId";

export async function getSetting(db: Db, key: SettingKey): Promise<string | null> {
  const rows = await db.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [
    key,
  ]);
  return rows[0]?.value ?? null;
}

export async function setSetting(db: Db, key: SettingKey, value: string | null): Promise<void> {
  if (value === null) {
    await db.execute("DELETE FROM settings WHERE key = ?", [key]);
    return;
  }
  await db.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}
