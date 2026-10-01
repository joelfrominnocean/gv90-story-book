# The Making of GV90 – the library of chapter books

Mobile-first interactive chapter book for the Genesis GV90 launch. Internal pitch prototype, not a production site.
The build brief and the creative brief (job 104632 v1) are kept out of this public repo; the copy in `content.json` is taken verbatim from the creative brief.

```bash
npm install
npm run dev          # http://localhost:5173, also on your LAN for a phone
```

## URL flags

| Flag | Effect |
| --- | --- |
| _(none)_ | The library: one book per chapter. |
| `?chapter=N` | Take book N (0–5) off the shelf and open it. Add `&page=M` (0-based) to open at a page. |
| `?preview=all` | Ignore unlock dates (client review). Without it, chapters 2–5 show as sealed pages. |
| `?debug=1` | Source badge on every string (tap it for ref, flags, notes), per-module direction, open flags, source links. |
| `?3d=0` / `?3d=1` | Force the 2D book (crossfades) or the 3D book. Default: 3D, unless the reader prefers reduced motion, WebGL is missing, or the device looks low-powered. |
| `?ryi=1` | The "already registered" CTA: "Coming Soon", not a link. |
| `?utm_*` | Passed through to the RYI link. Every other param is dropped. |

Example: `?chapter=1&page=3&preview=all&debug=1`

## Where the words live

All copy is in [src/content/content.json](src/content/content.json). Every visible string is `{ text, source, ref?, flags?, note? }`
with `source` one of `brief-approved`, `brief-draft`, `generated`. `text: null` renders a labelled "Copy pending" placeholder.
The schema (zod) is in [src/content/schema.ts](src/content/schema.ts); a malformed string shows its JSON path on screen.

```bash
npm run verify:copy     # every brief-approved / brief-draft string must appear verbatim in the creative brief (needs the .docx locally, which is not in this repo)
npm run extract:brief   # re-extract text + stills after a new brief version lands in the project root
npm run placeholders    # regenerate the labelled sample video clips (uses ffmpeg-static)
```

When creative sign off copy, edit the string in `content.json`, change `source` to `brief-approved`, and run `verify:copy`.

## Swapping in real assets

- **Video:** drop files in `public/assets/video`, then set `video.sources.mp4` / `webm` (and `captions.vtt`) on the chapter. Until then a labelled sample clip plays.
- **Stills:** set `heroes[].src` and `status: "supplied"`.
- **Brand fonts:** replace Cormorant Garamond / Inter in `src/styles/tokens.css` (`--serif`, `--sans`).

## How it reads

**The library** is a whole bookcase wall you drag along, with a fireplace as the small bay in the middle, in the 3D version (a plain list in the 2D one; see "The library wall" below). Our six books stand among rows of dim background books, each with a warm glow so you know which to pick. A sealed book wears a plain paper band with its unlock date. Tap a book: it lifts off the shelf, turns to face you, the room dims, and it opens. **Library** puts it back. **A book is a run of pages and nothing
scrolls**: the opener (title, hero, hotspots), then one brief bullet per page (two only when both are very short), then a closing
page with the quiet CTA. The prologue is its three still frames. `src/book/pages.ts` decides the pages (`PAIR_MAX_CHARS`);
copy is never reworded or split. Text is sized to fit each page (`src/book/layout.ts`), down to a 320×568 phone. A sealed book
is a single sealed page.

Swipe, tap the page edge, or use the arrow keys to turn pages. **Library** (top left) closes the book and puts it back.

## The 3D book (`src/book3d`)

A Three.js book sits behind the HTML. While you read, the camera looks straight down at the page and the live HTML sits on top of
it. On a turn the HTML steps aside, the leaf curls over the spine, and the next page settles in under the HTML again. A page turn
is about 650ms with a light camera tilt; opening or closing the cover is a bigger move; jumping several pages is a quick,
staggered flurry (`?page=M`).

Modelled on the reference photo, not scanned from it: thread-bound soft wrapper with a title slip, five-hole stitching over the
spine edge, thin cream leaves, layered fore-edges, ruled verso pages. Each chapter's wrapper carries a faint tint of its accent.
Every surface is drawn in canvas (`textures.ts`), so there are no image assets and the scene chunk is about 250KB gzipped.

| File | What it does |
| --- | --- |
| `rig.ts` | Pure maths: turn timing, leaf curl, stack heights, camera poses. Tune the feel here (`curlFor`, `PAGE_MS`, `COVER_MS`, `PULL_*`). |
| `buildBook.ts` | Scene graph: boards, blocks, bending leaves, stitching, lamp lines. |
| `textures.ts` | Hanji paper, cloth, slip, fore-edge, and every printed page (laid out with `book/layout.ts`, so a leaf's print and its live page match). |
| `BookScene.tsx` | R3F canvas, on-demand render loop (it draws only while something moves), camera. |

In dev, `window.__book` exposes the rig. `__book.rig.frozen = true` plus setting `rig.leaves[k].p` / `rig.pull` holds a mid-turn frame;
`__book.force = 1` pins the printed pages on over the live ones to check alignment.

2D fallback: same pages, same navigation, crossfade between pages. three.js is not even downloaded in that mode.

### The library wall (`src/wall`) – the default library

The library is **one wide picture of a whole bookcase wall** (7.2 units across, three bays) with the fireplace as the small middle bay
and the six books on the shelf above it. It is a Blender render built from CC0 textures (Poly Haven, ambientCG), larger than the
screen: **drag (or pinch, or arrow keys) to look along it**, or tap **Whole wall** to see all of it. It opens on the six books and the fire.

- **Fire**: real footage, set into the fireplace and blended with `screen` (black in the footage is the dark of the firebox), plus a warm
  light that spills out and flickers (`.wall__spill`). It stops while a book is down. The clip is silent; the crackle is still synthesised.
- **Glow and bands**: drawn by the page, not baked, because they change with the date: warm glow on open chapters, a fainter cool one on
  sealed ones, and a paper band with the unlock date on each sealed book.
- **Taking a book down**: the page zooms the picture until the book is `WALL_BOOK_FRAC` of the screen tall and centred (`src/wall/focus.ts`);
  the 3D camera looks at the same book from the distance that makes it that size, so the real book stands exactly where the picture shows it.
  The real book wears a crop of the picture's own spine for its first moments (`src/wall/image.ts`), and the picture swaps to a patch of the
  shelf with that book missing (`patch-N.webp`), so nothing pops. Putting it back reverses all of it.
- **Rebuilding it**: `zsh scripts/blender/render_wall.sh` (about 3 minutes on an M-series Mac), then `node scripts/make-wall-assets.mjs`
  (WebP files into `public/assets/room/` and `src/wall/layout.json`, which holds where every spine and the fire opening sit). The scene is
  `scripts/blender/library_hero.py` with `WALL=1`; it also renders the old tight shot without it. The fire loop is `zsh scripts/make-fire-loop.sh`.
- **If it is missing or fails to load**, the 3D shelf below is used instead (build flags `__HAS_WALL__`, `__HAS_FIRE_VIDEO__`).

**Fire footage credit and licence:** "Burning Logs in a Fireplace" by Brixiv, [Pexels](https://www.pexels.com/video/burning-logs-in-a-fireplace-7091442/),
used under the Pexels licence (free to use, no attribution required, but not to be redistributed as it was). Only a cropped, re-timed 12-second
loop (`public/assets/room/fire.mp4`, 2MB) ships; the 49MB original stays in `assets-src/fire/` and is not committed. The clip's own audio track is silent.

### The 3D shelf (`shelf.ts`, `fire.ts`) – the fallback room

Everything is procedural: timber from canvas grain, the background books as one instanced mesh, the moon jar as a lathe,
the flame as a noise shader (three layers, so it licks and never loops) with rising sparks and a flickering warm light.
The cool two-line lamp under the upper shelf is the counterpoint to the fire. The fire runs while the library is up and rests
while a book is down. **Sound** (bottom right, off by default) adds a synthesised crackle (`src/app/fireSound.ts`, no audio
files); it plays only in the library. A flat dark curtain hides the room while a book is being read, which is why the room sits
`SHELF_Z` behind the reading stage.

### Fire texture and licence

The flame is a real photograph (`public/assets/fire/flame.webp`, 512px, 23KB) from aitextured.com, warped by moving noise and layered three times
(mirrored, differently cropped) over the procedural flame, which stays as the fallback. **The site lists the licence and source as "not verified"**,
so this is internal-only until someone verifies it or it is replaced. **It is not in the public repo** (nor are the three stills from the brief): the public page shows labelled placeholders and the procedural flame instead. Publish them with `git add -f public/assets/stills public/assets/fire`. The 8K original (9MB) is kept out of `public/` in `assets-src/fire/` and is not
committed. To swap the flame, replace `flame.webp` with any flame on black, square, base at the bottom edge.

## Phases

1. **Skeleton**: content model, 2D chapter pages, navigation, video player, routing.
2. **The book**: Three.js cover, opening animation, page curl (crossfade stays as the reduced-motion fallback).
2b. **Library and paged books**: each chapter a book read a page at a time, on a bookcase wall with a fireplace; books lift off the shelf and go back; sealed books wear bands (done).
3. Chapter 1 hero: procedural Moon Jar, scroll rotation, hotspots, lamp divider.
4. Polish: sound, locked-chapter states, tracking events, performance pass, preview deploy.

## Known gaps

See `meta.openFlags` in `content.json` (or the debug panel): launch date mismatch, spec claims to verify, stills usage,
placeholder unlock dates, the superseded OLD section left out, and so on.
