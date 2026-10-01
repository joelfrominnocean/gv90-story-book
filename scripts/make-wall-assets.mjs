// Turns the Blender renders in renders/wall/ into what the site loads:
//   public/assets/room/wall.webp, patch-0..5.webp   and   src/wall/layout.json (where everything sits, 0..1 from the top-left)
// Run after `zsh scripts/blender/render_wall.sh`:   node scripts/make-wall-assets.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import ffmpeg from "ffmpeg-static";

const out = "public/assets/room";
mkdirSync(out, { recursive: true });
const enc = (src, dst, q) => execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", src, "-c:v", "libwebp", "-quality", String(q), "-compression_level", "6", dst]);
const kb = (p) => Math.round(statSync(p).size / 1024);

const base = JSON.parse(readFileSync("renders/wall/base_layout.json", "utf8"));
enc("renders/wall/base.png", `${out}/wall.webp`, Number(process.env.Q ?? 80));
console.log(`wall.webp ${kb(`${out}/wall.webp`)} KB`);

const patches = [];
for (let n = 0; n < 6; n++) {
  enc(`renders/wall/patch_${n}.png`, `${out}/patch-${n}.webp`, 92);
  const [u0, v0, u1, v1] = readFileSync(`renders/wall/patch_${n}.border`, "utf8").trim().split(",").map(Number);
  patches.push({ u0, v0, u1, v1 });
  console.log(`patch-${n}.webp ${kb(`${out}/patch-${n}.webp`)} KB`);
}
writeFileSync("src/wall/layout.json", JSON.stringify({ ...base, patches }, null, 1) + "\n");
console.log("src/wall/layout.json written");
