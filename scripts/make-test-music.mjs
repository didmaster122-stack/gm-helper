// Generates a test music folder: node make-test-music.mjs <outDir>
// 500+ short WAV tracks in Category / Collection folders, a few longer ones for
// crossfade checks, plus unsorted files and an empty collection.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2];
if (!out) throw new Error("usage: make-test-music.mjs <outDir>");

const RATE = 8000;

/** Mono 16-bit WAV: a few notes of a tune, unique per seed so hashes differ. */
function wav(seconds, seed) {
  const n = Math.round(seconds * RATE);
  const data = Buffer.alloc(n * 2);
  const base = 220 * 2 ** ((seed % 12) / 12);
  const steps = [1, 5 / 4, 3 / 2, 2, 3 / 2, 5 / 4];
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const note = steps[Math.floor(t * 2 + seed) % steps.length];
    const env = Math.min(1, t * 4, (seconds - t) * 4);
    const v = Math.sin(2 * Math.PI * base * note * t) * 0.3 * env;
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const layout = {
  Бой: ["Эпичные", "Засада", "Босс"],
  Атмосфера: ["Таверна", "Дождь", "Лес", "Подземелье"],
  Город: ["Рынок", "Праздник"],
  Эмоции: ["Грусть", "Тайна", "Победа"],
};
const words = ["Тема", "Мотив", "Эхо", "Шаги", "Ветер", "Огонь", "Песнь", "Ночь"];

let seed = 1;
let count = 0;
for (const [category, collections] of Object.entries(layout)) {
  for (const collection of collections) {
    const dir = join(out, category, collection);
    mkdirSync(dir, { recursive: true });
    for (let i = 1; i <= 42; i++) {
      const name = `${words[i % words.length]} ${collection.toLowerCase()} ${i}.wav`;
      writeFileSync(join(dir, name), wav(4 + (i % 5), seed++));
      count++;
    }
  }
}
// Longer tracks to hear the crossfade.
const long = join(out, "Атмосфера", "Длинные");
mkdirSync(long, { recursive: true });
for (let i = 1; i <= 4; i++) {
  writeFileSync(join(long, `Долгая тема ${i}.wav`), wav(25, seed++));
  count++;
}
mkdirSync(join(out, "Бой", "Пустая подборка"), { recursive: true });
writeFileSync(join(out, "Не на месте.wav"), wav(5, seed++));
writeFileSync(join(out, "Бой", "Без подборки.wav"), wav(5, seed++));
count += 2;
console.log(`${count} tracks in ${out}`);
