// Turns the Blender layer renders (renders/glasshouse/*.png + manifest.json) into what the site loads:
//   public/assets/room/glasshouse/<id>.webp   and   src/room/glasshouse.manifest.json
// Run after: LAYERS=1 OUTDIR=renders/glasshouse RES=1 /Applications/Blender.app/Contents/MacOS/Blender -b -noaudio --python scripts/blender/listening_room.py
//   node scripts/make-glasshouse-assets.mjs
// Any layer's image can be replaced by an illustrator's art of the same box: edit nothing but the file (or its `src` in the manifest).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import ffmpeg from "ffmpeg-static";

const src = "renders/glasshouse";
const out = "public/assets/room/glasshouse";
if (!existsSync(`${src}/manifest.json`)) {
  console.error(`No ${src}/manifest.json: run the Blender layers render first (see the header of this file).`);
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const man = JSON.parse(readFileSync(`${src}/manifest.json`, "utf8"));
const quality = { sky: 70, floor: 78, frame: 86, object: 88, platter: 88, arm: 90 };
let total = 0;
for (const l of man.layers) {
  const dst = `${out}/${l.id}.webp`;
  // the glass mask is a flat two-level picture: lossless is tiny and keeps its edges exact
  const mode = l.kind === "mask" ? ["-lossless", "1"] : ["-quality", String(quality[l.kind] ?? 85)];
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", `${src}/${l.file}`, "-c:v", "libwebp", ...mode, "-compression_level", "6", dst]);
  const kb = Math.round(statSync(dst).size / 1024);
  total += kb;
  l.src = `/assets/room/glasshouse/${l.id}.webp`;
  delete l.file;
  console.log(`${l.id.padEnd(12)} ${String(kb).padStart(5)} KB`);
}
writeFileSync("src/room/glasshouse.manifest.json", JSON.stringify(man, null, 1) + "\n");
console.log(`total ${total} KB, ${man.layers.length} layers -> src/room/glasshouse.manifest.json`);
