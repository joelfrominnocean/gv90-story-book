// Generates labelled 9:16 placeholder clips (MP4/H.264 + WebM/VP9) and a sample WebVTT.
// No stock footage, no other vehicles: just a grey frame saying what it stands in for.
//   npm run placeholders
// Real footage goes in public/assets/video and is referenced from content.json (video.sources).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "placeholders");
mkdirSync(out, { recursive: true });

const FONT = "/System/Library/Fonts/Supplemental/Arial.ttf";
if (!existsSync(FONT)) throw new Error(`Font not found: ${FONT}`);

const DURATION = 8;
const clips = [
  { id: "teaser", name: "DBA teaser clip", chapter: "Prologue" },
  { id: "ep01", name: "GV90_Documentary_EP.01", chapter: "Chapter 2" },
  { id: "ep02", name: "GV90_Documentary_EP.02", chapter: "Chapter 1" },
  { id: "ep03", name: "GV90_Documentary_EP.03", chapter: "Chapter 3" },
];

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
const text = (t, size, y, color, x = "(w-text_w)/2", raw = false) =>
  `drawtext=fontfile='${FONT}':text='${raw ? t : esc(t)}':fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}`;

for (const c of clips) {
  const vf = [
    // faint frame + X so it reads as a placeholder at a glance
    "drawbox=x=24:y=24:w=iw-48:h=ih-48:color=0x55524b@0.9:t=2",
    "drawbox=x=48:y=ih*0.5:w=iw-96:h=1:color=0x55524b@0.6:t=fill",
    text("PLACEHOLDER", 22, 300, "0xa8a59b"),
    text(c.name, 30, 350, "0xf3efe6"),
    text("9:16 vertical cut goes here", 22, 400, "0xa8a59b"),
    text(c.chapter, 22, 440, "0xa8a59b"),
    // moving counter + progress bar prove the clip is actually playing
    text(`%{eif\\:t\\:d}s / ${DURATION}s`, 28, 700, "0xf3efe6", "(w-text_w)/2", true),
    "drawbox=x=48:y=878:w=iw-96:h=1:color=0x55524b:t=fill",
    text("\u2022", 44, 856, "0xf3efe6", `48+(w-96-text_w)*t/${DURATION}`),
  ].join(",");

  const base = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=0x1c1a17:s=540x960:r=24:d=${DURATION}`,
    // a very quiet low tone so "tap for sound" is demonstrable
    "-f", "lavfi", "-i", `sine=frequency=174:sample_rate=44100:duration=${DURATION}`,
    "-vf", vf,
    "-af", "volume=0.08,afade=t=in:d=1,afade=t=out:st=7:d=1",
    "-shortest",
  ];

  execFileSync(ffmpegPath, [
    ...base,
    "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-crf", "30", "-preset", "slow",
    "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart",
    join(out, `${c.id}.mp4`),
  ]);
  execFileSync(ffmpegPath, [
    ...base,
    "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "42", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4",
    "-c:a", "libopus", "-b:a", "32k",
    join(out, `${c.id}.webm`),
  ]);
  console.log(`✓ ${c.id}`);
}

writeFileSync(
  join(out, "sample.vtt"),
  `WEBVTT

00:00.400 --> 00:03.200
Placeholder caption. Real captions sit here.

00:03.400 --> 00:07.600
Captions are on by default and arrive as WebVTT with the vertical cut.
`,
);
console.log("✓ sample.vtt");
