// Generates a test art library: node make-test-library.mjs <outDir> [variants]
// 30 variants (default) give ~1400 arts, 210 give ~10 000.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const out = process.argv[2];
if (!out) throw new Error("usage: make-test-library.mjs <outDir>");

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** Gradient PNG with a circle, unique per seed so hashes differ. */
function png(width, height, seed) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const r0 = (seed * 37) % 256,
    g0 = (seed * 91) % 256,
    b0 = (seed * 53) % 256;
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const i = y * (width * 3 + 1) + 1 + x * 3;
      const dx = x - width / 2,
        dy = y - height / 2.4;
      const inCircle = dx * dx + dy * dy < (Math.min(width, height) / 4) ** 2;
      raw[i] = inCircle ? 255 - r0 : (r0 + x) % 256;
      raw[i + 1] = inCircle ? 255 - g0 : (g0 + y) % 256;
      raw[i + 2] = inCircle ? 230 : (b0 + ((x + y) >> 1)) % 256;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const layout = {
  "D&D 5e": {
    Нежить: ["Лич", "Скелет-лучник", "Зомби", "Вампир", "Призрак", "Банши", "Гуль", "Мумия"],
    Драконы: ["Чёрный дракон", "Красный дракон", "Синий дракон", "Золотой дракон", "Виверна"],
    "Гильдия воров": ["Вор", "Убийца", "Скупщик", "Глава гильдии", "Карманник"],
    Звери: ["Волк", "Медведь", "Гигантский паук", "Ворон", "Кабан"],
  },
  "Pathfinder 2e": {
    Goblins: ["goblin-boss", "goblin_warrior", "goblin-pyro", "goblin-commando"],
    Демоны: ["Бабау", "Врок", "Глабрезу", "Марилит"],
  },
  "Warhammer FRP": {
    Скавены: ["Крысолюд", "Серый провидец", "Чумной монах"],
    Империя: ["Охотник на ведьм", "Солдат", "Жрец Зигмара"],
  },
};

let seed = 1;
let count = 0;
const variants = Number(process.argv[3] ?? 30);
for (const [system, groups] of Object.entries(layout)) {
  for (const [group, names] of Object.entries(groups)) {
    const dir = join(out, system, group);
    mkdirSync(dir, { recursive: true });
    for (const name of names) {
      for (let v = 1; v <= Math.ceil((variants * 6) / names.length); v++) {
        const file = v === 1 ? `${name}.png` : `${name} ${v}.png`;
        writeFileSync(join(dir, file), png(160 + (seed % 5) * 40, 200 + (seed % 3) * 40, seed++));
        count++;
      }
    }
  }
}
// Empty group, unsorted files and a service folder that must be ignored.
mkdirSync(join(out, "D&D 5e", "Пустая группа"), { recursive: true });
writeFileSync(join(out, "лежит в корне.png"), png(200, 200, seed++));
writeFileSync(join(out, "D&D 5e", "не в группе.png"), png(200, 200, seed++));
mkdirSync(join(out, "D&D 5e", "Нежить", "Вложенная"), { recursive: true });
writeFileSync(join(out, "D&D 5e", "Нежить", "Вложенная", "глубоко.png"), png(200, 200, seed++));
mkdirSync(join(out, "D&D 5e", "Нежить", "_tokens"), { recursive: true });
writeFileSync(join(out, "D&D 5e", "Нежить", "_tokens", "лич.token-1.png"), png(64, 64, seed++));
writeFileSync(join(out, "D&D 5e", "Нежить", "notes.txt"), "not an image");
count += 3;
console.log(`${count} images in ${out}`);
