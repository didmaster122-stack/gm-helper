// Error log in the app cache (spec §8.1): console.error calls and uncaught errors.
import { join } from "@tauri-apps/api/path";
import { appendCacheFile, cacheDir, fileSize, replaceAppFile, revealInExplorer } from "../fs";
import { formatLogEntry, MAX_LOG_BYTES } from "./format";

const LOG_FILE = "errors.log";
const OLD_LOG_FILE = "errors.old.log";

const encoder = new TextEncoder();
let queue: Promise<void> = Promise.resolve();
/** Bytes in the current log file; null until it is first checked. */
let size: number | null = null;

export async function logPath(): Promise<string> {
  return join(await cacheDir("logs"), LOG_FILE);
}

async function append(entry: string, report: (...values: unknown[]) => void): Promise<void> {
  try {
    const path = await logPath();
    size ??= await fileSize(path);
    if (size > MAX_LOG_BYTES) {
      await replaceAppFile(path, await join(await cacheDir("logs"), OLD_LOG_FILE));
      size = 0;
    }
    const data = encoder.encode(entry);
    await appendCacheFile(path, data);
    size += data.length;
  } catch (error) {
    // Through the original console.error: a failing log must not log itself in a loop.
    report("Cannot write the error log", error);
  }
}

/** Writes an entry to the log; entries keep their order. */
export function logError(...values: unknown[]): void {
  const entry = formatLogEntry(new Date(), values);
  queue = queue.then(() => append(entry, original));
}

let original: (...values: unknown[]) => void = (...values) => console.error(...values);
let started = false;

/** Mirrors console.error and uncaught errors into the log. Call once at startup. */
export function initErrorLog(): void {
  if (started) return;
  started = true;
  const consoleError = console.error.bind(console);
  original = consoleError;
  console.error = (...values: unknown[]) => {
    consoleError(...values);
    logError(...values);
  };
  window.addEventListener("error", (e) => logError("Uncaught", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => logError("Unhandled rejection", e.reason));
}

export async function revealErrorLog(): Promise<void> {
  const path = await logPath();
  // Explorer can only select an existing file.
  if ((await fileSize(path)) === 0) await appendCacheFile(path, new Uint8Array());
  await revealInExplorer(path);
}
