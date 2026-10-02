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

### v2: the listening room (`src/room`, branch `v2-listening-room`) – the default library on this branch

v1 (tag `v1`, still what `main` serves) is the bookcase wall below. v2 explores a different idea: **a place worth being in**, a rainy
night in a private listening room that you could leave open. It is a proactive best attempt, so everything a client could change is
data and nothing here is final:

- **The room** is one scene, wider than the screen (drag to look along it; the city behind the glass moves slower than the room, which is
  what makes the window deep). Flat-colour SVG with ink outlines (`RoomArt.tsx`): **the art is a scamp** and is to be replaced by an
  illustrator's style frame. Every object is placed in one coordinate system, so a new drawing slots in.
- **Rain on the glass** (`RainGlass.tsx`): beads that grow, run in stops and starts, and join; a canvas the size of the window at 30 fps, paused when the
  tab is hidden or a book is open. Lightning is rare (first after ~20 s, then every minute or two), with thunder a few seconds behind it.
  The city's window lights change one at a time every few seconds. The room moves from late afternoon to night as more chapters are open (`palette.ts`).
- **The record** (`Turntable.tsx`, `roomAudio.ts`): tap the turntable and the arm swings over, the needle lands (thump, crackle) and the music fades in.
  That tap is also what lets a phone browser play sound at all. Tap the sleeve beside it for the next record, the moon jar to hear it ring.
  Rain, crackle, thunder and the jar's tone are all synthesised in Web Audio (no files); the music is a plain `<audio>` element, so it can carry on
  with the Media Session controls. Sound steps back while a book is open.
- **The six frames on the wall are the chapters** (one container for the approved copy; everything else is atmosphere with no product claims). An open
  chapter is a poster; one that has not arrived is an empty frame with a brass plate showing its date. No counters, no "locked". A poster you have not
  opened yet glows faintly. Picking one dims the room and the real 3D book comes down and opens (same `Stage3D` wall mode as v1).
- **Music is a placeholder**: `src/room/room.manifest.json` lists eight tracks from [open-lofi](https://github.com/btahir/open-lofi) (CC0, but
  **AI-generated with Suno**), with a per-track level correction. They are files in `public/assets/room/audio/` (25MB). Formal music (commissioned or
  licensed, with sync and master clearance) replaces them by replacing the files and entries and flipping `status` to `final`.
- **The folk tale** (`TaleBook.tsx`, `TaleArt.tsx`): the open book on the credenza opens *The Sun and the Moon* (해와 달이 된 오누이) as six illustrated pages
  with paper-turn sounds. The wording is a retelling in new words, tagged `generated` + `verify-before-use` in `content.json` (`meta.tale`): tellings differ, so a
  native speaker should check the wording, the framing and which version is told. The drawings are scamp SVG in the room's style, to be redrawn.
- **Type:** Urbanist replaces Cormorant Garamond and Inter everywhere (HTML and the canvas that prints the 3D leaves). It is the Google font nearest to
  Genesis Sans, which genesis.com loads as two proprietary families (`GenesisSansHead` 300/400, uppercase and light for headings; `GenesisSansText` 400/500/700
  for text). Measured in the live page, its widths for headings and text agree with Genesis's to about 1.5% and its x-height to within 0.03. Runner-up: Hanken
  Grotesk (warmer for body text). Baseline constants for the canvas printing live in `textures.ts` (ascent 0.95, descent 0.25).
- **Rain** (`rainSynth.ts`): thousands of separate synthesised impacts (glass ticks, leaf splashes, roof thuds, a few heavy drips) scattered through long stereo buffers of
  different lengths, plus a quiet distant wash that gusts. **Every impact is a burst of noise through a broad filter, never a sine**: a pitched "plink" rings like a bell
  once a hundred land a second (an earlier version did exactly that, and it was the weird bell sound). A dev check compares each layer's spectral peak to its median:
  about 5 for the glass layer, against thousands for sine plinks. The glass layer's peakiness (kurtosis) is about 13 where white noise is 3. Tuned twice for calm: fine, close-packed drops (hundreds a second) with a narrow loudness range, soft onsets, no loud thuds, a steady wash underneath, and the
  top of the rain rolled off at 4.2 kHz on its bus (glass layer peakiness about 5, its loudest moments under 2x the typical level). The rain's overall level is one constant, `RAIN_TRIM` in `roomAudio.ts` (0.75, a quarter off), which applies to the synthetic rain and to an audition
  recording alike. It is still a stand-in for a
  real recording, and I cannot hear it, so listen before you trust it.
- **The glasshouse, as layers** (default room when built; `?room=svg` shows the earlier flat vector room): the Blender scene
  (`scripts/blender/listening_room.py`, `glasshouse_layers.py`) is rendered as 22 separate transparent layers plus a manifest, and
  `src/room/GlasshouseRoom.tsx` assembles them in a drag-to-pan scene with parallax. Rebuild: `LAYERS=1 MOOD=teal OUTDIR=renders/glasshouse RES=1 SAMPLES=40
  /Applications/Blender.app/Contents/MacOS/Blender -b -noaudio --python scripts/blender/listening_room.py` (about 3 minutes), then `node scripts/make-glasshouse-assets.mjs`
  (WebP files into `public/assets/room/glasshouse/`, about 0.5MB, and `src/room/glasshouse.manifest.json`). `ONLY=chair,jar` renders just those layers, but writes an
  incomplete manifest, so run the converter only after a full render.
  - **The look (`STYLE=film`, the default):** an architect's house at dusk, not a drawn world. Physically based, procedural materials (`film_materials.py`): oiled
    walnut with grain, linen with a woven surface, honed stone, glazed ceramic (the moon jar very faintly crazed), brushed brass, dark polished floor, wool, leaves.
    Designed pieces (`furniture_film.py`): a fluted walnut credenza on splayed legs with brass bar pulls, a Jeanneret-style lounge chair, a ceramic lamp with a linen
    drum shade, foliage built leaf by leaf, glazing on a stone upstand under slim bronze-steel ribs. Soft filmic light (AgX): a cool dusk key, a cool bounce from the
    camera's side, a low warm rim from the horizon, and amber only at the lamp and a thin line of horizon. No outlines, no halftone. The sky plates keep a light
    painterly (Kuwahara) finish and exact painted colours. The Korean notes are objects (moon jar, bonsai, tea set, the folding screen, the folk-tale book) and a faint
    old-town roofline at the horizon; no pagoda, no lanterns. Palette (locked): shadows #0F1F24, foliage #3E5A4A, brass #B08D57, paper #E8DFCF, amber #E0A458.
  - **Other looks, behind flags:** `STYLE=toon` is the earlier inked, banded look (the approved baseline of that round); `STYLE=sable` is a cel-shaded experiment
    (two hard tones, thresholded-noise patches, sparse stipple, tinted ink at every change of tone, drawn by a compositor edge pass); `GATE=1`, `LANTERNS=1` and
    `SCREEN_ART=1` bring back the palace gate, hanging hanji lanterns and the five-peaks painting on the screen. All were judged too themed for the brief.
  - **Every object is a swappable layer.** The manifest gives each an id, a box on the frame (fractions), a depth (`par`, 1 = moves with the room, below 1 =
    far away), a z-order, a hit area where it is touchable, and an image path. An illustrator's art replaces any one by dropping in a transparent image of
    the same box, with no code change: sky (three times of day, wider than the frame for parallax), floor, credenza, turntable base, platter, tonearm, sleeve, lamp,
    tea table, the folk-tale book, moon jar, chair, camellia, bonsai, plants, the folding screen, desk, the big fern, frame. The manifest also lists the places the opening
    pan visits and that words appear near (`focus`).
  - **Glass:** clear in the picture. `glassmask` is a small lossless image that is opaque wherever you can see glass (furniture and plants in front of it cut out), and
    the page draws the weather inside it: a faint smoked tint, the rain, and the lightning. The frame layer is rendered with every object held out of it, so it sits
    on top of everything without covering anything.
  - **The folding screen** (one panel per chapter) is the one place the page draws into the picture: the manifest holds the four corners of each panel's poster
    area, and `PosterFace` (poster, or a dark frame with a brass date plate) is warped onto it with a CSS matrix from data. State comes from the chapter's unlock
    date, as everywhere else; no counters, no "locked" wording.
  - **Turntable:** drawn from a little above, with the platter and tonearm drawn flat from straight above, so the page can turn one and swing the other (squashed by
    `sin(elevation)` to match). Tapping it (the platter and arm only, never the whole sprite) swings the arm, plays the crackle, fades the music in and spins the platter up
    to 33 1/3 rpm; that tap is also the audio unlock, and a small plate names the record while it plays. **Only the turntable and the sleeve start music.** The moon jar
    only rings (its own bus, straight to the output; it never starts the rain or a record or touches the Sound switch); the tea table does nothing.
  - **The interface is nearly silent (by design):** a title card at the start (the title and the one approved line) that fades after about five seconds or at the first touch,
    a tiny speaker icon (no word; its label is for screen readers) and nothing else standing on the room. The room speaks when you come near: the folding screen says
    "Folded into a screen" and the book says its title and "A Korean folk tale", each once per visit (about four seconds), in one caption slot at the bottom of the
    screen, so labels cannot overlap. While a record plays its title sits in the same slot. The book is the tap target for the tale (it glows faintly until first opened). On a first
    visit the view also drifts, wordlessly, to the screen, then the book, then home (`?tour=1` plays it again, `?tour=0` never; any touch ends it). No counters, no "locked" wording.
    All of that copy is `generated` in `content.json`.
  - **Zoom out (a small magnifier icon beside the sound icon):** shows the whole room at once, scaled to fit the width with the dark of the room around it (in a portrait phone the
    room is a wide strip, in landscape it nearly fills the screen). While it is showing, nothing in the room is touchable; tap anywhere to zoom back in to that spot, or press the icon
    again (back to where you were) or Escape. The scene sits in a wrapper (`.gh__zoom`) whose transform is eased between "whole room" and none; the parallax and the pan are untouched.
  - **A game of Baduk (Go) on the coffee table** (`src/room/baduk/`): a low walnut table in front of the armchair, a pale wooden board and a lidded stone bowl at each
    side (all in the Blender scene, `film_coffee_table`). The live game is drawn onto the top of the board in the room, warped onto its projected corners
    (`manifest.baduk.quad`), so you can see stones go down while you look around. Tapping the table opens the board from above, on walnut, with the room dimmed behind.
    You play black on a 9x9 board; touch and slide to aim (the stone shows where it will go) and lift to place it; a mouse hovers and clicks; the arrow keys and Enter work too.
    Real rules (`engine.ts`): captures, no suicide, the simple ko rule, passing, and two passes end the game. The opponent (`ai.ts`) is gentle: it scores every legal move on what
    a beginner learns first (take, save, do not self-atari, third and fourth lines, stay near the last move), keeps the best ten and tries each with 72 random games; about a
    fifth of a second a move, with a deliberate human-sized pause on top. **No score, no clock, no result is ever shown**: when you both pass, the board says "The game rests."
    The game is kept in the browser (the moves after the opening), so it is there, mid-game, next visit; "New game" starts again from an opening position.
    Stones click softly on wood (synthesised, follows the Sound switch). Words: coming near the table says "A game of Baduk" and its Hangul name 바둑 (generated; a
    Korean speaker should check it).
  - **Rain** (`GlassRain.tsx`): sparse falling streaks at three distances (short, slow and faint far away; a few long ones near), plus small beads and a few runners that
    join, at 0.6 of the pixels and 30 fps, only while the tab is visible and no book is open. The room pauses when hidden while the audio carries on, and the Media Session
    controls (play, pause, next, previous) are set.
  - **Rain audition (`?rain=<name>`):** plays `public/assets/room/audition/<name>.mp3` in place of the synthesised rain: looped with a 4-second equal-power crossfade so
    there is no seam, set to about the synthetic rain's loudness, with the softening filter bypassed. The two files there now, `rain-on-window` (52 s) and `light-rain`
    (3 min 56 s), are from [Moodist](https://github.com/remvze/moodist) (MIT code; its README says its sounds are a mix of Pixabay Content License and CC0 with no per-file list, so
    their licences are untraced). The folder is gitignored, so they never reach the public repo, and the page falls back to the synthetic rain if a file is missing.
    Before anything ships: trace each file to its source, or replace it with a recording whose licence is clear (a CC0 loop, or one recorded for this project).
  - **Time of day:** the sky crossfades late afternoon, dusk, night as more chapters arrive (one faint moon in all three); a night tint and the lamp's strength follow.
  - **Replacing a layer with the illustrator's art** needs only the file; a changed composition needs a re-render of the manifest (or edit its boxes).
- **Not built yet:** the illustrator's art (everything in the layers is a scamp), real field recordings, session-length tracking, a full-width layout on desktop,
  a lightning plate for the sky (the flash is a CSS overlay for now), more of the Seoul skyline as real art.
- `?library=wall` shows v1's bookcase wall on this branch, for comparison.

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
