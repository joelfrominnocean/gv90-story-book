# The Room, in 2.5D: refined art direction (working draft)

Status: a proactive "best attempt" (no client approval needed yet). Anything marked **[verify]** is not in the creative brief and must be confirmed before it ships.

## 0. What this is, and one correction

A fork of the listening room. The page is **already** a layered 2.5D scene (pre-rendered images in separate planes, with parallax and a pan); WebGL is not involved any more. So the reason to fork is not speed. It is **brand and craft**: a vector scene is exact, tiny (tens of KB, not half a megabyte), sharp at any pixel density, recolourable from a handful of tokens, and animatable. Everything that is not art stays: the Baduk engine, the audio engine, the screenings, the folk tale, the zoom-out, the pan.

| Keeps | Changes |
| --- | --- |
| Layer + manifest engine (`GlasshouseRoom`), hit areas, drag-to-pan | Art: Blender film render becomes generated vector layers |
| Baduk (rules, AI, saved game), record player logic, tale, screenings | Light: one lamp becomes "Two Lines" architectural light |
| Quiet UI: captions on approach, tiny icons, no counters | Palette: slate teal becomes indigo / violet / cashmere |
| Rain, thunder, soft sound design | Camera: pan plus a responsive micro-parallax (pointer, tilt) |

## 1. Art direction: Vector-Noir

**The line.** One precision: constant hairline weights in three tiers (structure, object, detail), round caps and joins, no wobble, no jitter, no texture, no grain, no halftone, no hatching. Fills are flat or smooth gradients only.

**Precise execution of imperfect forms.** The brief says a moon jar is "two hand-joined halves, never quite symmetrical, prized precisely because they're not perfect". So the linework is mathematically clean, but the *forms* carry a deliberate 2 to 3% asymmetry (an off-centre belly, a faint seam). Perfect symmetry would contradict the very thing we are celebrating.

**Depth without realism.** Each plane gets its own value and line weight: near planes are crisp and contrasty, far planes are thinner, lower in contrast, and more blue. No cast-shadow realism: light is soft pools and edge light under sharp lines.

**Carry-overs from four rounds of feedback (still binding):** restraint over spectacle; no halftone or texture; no cute or whimsical proportions; no theme-park Korean props (no pagoda, lanterns, motifs as wallpaper); never busy (one focal object at a time); words only when you come near; no counters, scores or "locked" language.

## 2. Heritage Luxury palette (proportions as briefed; hex values proposed)

**Verification status (corrected).** The creative brief names *Midnight Black* and *Majestic Blue* as paint colours (and bars them from the teaser copy) and *woven wool cashmere* as a cabin material; it does not use Royal Indigo or Purple Silk. An earlier draft of this file called those two unverified. That was wrong: Genesis's own Neolun page names them (see section 8).

| Name | Status |
| --- | --- |
| Midnight Black, Majestic Blue | confirmed on genesis.com (exterior two-tone) and in the brief |
| Royal Indigo (cashmere), Purple Silk (leather) | confirmed on genesis.com (interior); not in the brief |
| Vintage Violet | **[verify]** name not found on any Genesis page I read |
| Warm Cashmere | cashmere is a confirmed material; the name and the tint are ours |
| Moon Jar White, Linear Amber, Ink Indigo | our working names |

All hex values below are **proposals**, not Genesis values. Because the brief bars paint-colour names from the teaser copy, colour names stay in imagery and this document; they do not appear in `content.json` copy.

| Share | Role | Proposed |
| --- | --- | --- |
| 60% | Ink Indigo (ground, deepest shadow) | `#0A0D24` |
| | Royal Indigo (steel ribs, sky mid) | `#161C52` |
| | Majestic Blue (horizon, glass sheen, highlight line) | `#2C4FA3` |
| 30% | Purple Silk (upholstery, runner) | `#3D2F5B` |
| | Vintage Violet (lit edge of the same) | `#6E5A8A` |
| 10% | Moon Jar White (ceramics) | `#EEE9DE` |
| | Warm Cashmere (rug, throw) | `#CDBB9E` |
| | Linear Amber (the light lines) | `#F4B15A` |

Guardrails: the violet stays **dark and desaturated** (it must never drift to the lilac we rejected). Amber is counted by what you *see*, glow included: target under 4% of the frame.

## 3. Structure: four planes plus light

Mapped onto the existing manifest ids so the engine needs no rewrite.

| Plane | Contents | Parallax factor | Notes |
| --- | --- | --- | --- |
| L1 Foreground | oversized, soft-edged botanical leaves, framing | about 1.25 to 1.4 | edges softened by gradient opacity or a baked static blur; never a runtime filter |
| L2 Midground (hub) | credenza + record player, moon-jar lounge chair, round Baduk table, moon jar, tale book, folding screen | 1.0 | every touchable thing; the platter and tonearm are SVG, so they rotate crisply |
| L3 Greenhouse | arched ribs, mullions, glass with semi-transparent gradient sheen for light refraction | 0.88 to 0.94 | the two light lines run along the ridge and the floor edge |
| L4 Deep background | gradient night sky, moon, faint city, far hills | 0.45 to 0.65 | time of day is **CSS-variable gradients**, replacing three sky images |
| Light (additive) | glow maps for each light line, the record pilot, the board edge | follows its plane | pre-built soft gradients, composited additively; no live blur |

Camera: drag-to-pan stays (a phone shows only a slice of a panorama). On top: pointer parallax on desktop, opt-in device tilt on phones (iOS needs a permission tap), micro-motion only. No scroll surface exists, so "scroll parallax" is not used.

Cinemagraph loops (transform and opacity only, 10 to 12 elements at most): rain, light lines breathing (6 s), leaf sway (±1.2 degrees, 9 s), moon drift, sparse window twinkle, the platter, ripples on the jar. Reduced-motion: a still, with no sway.

## 4. Forms: one continuous gesture

Each bespoke piece is drawn as a single sweeping curve, with the moon jar's belly as the reference. No hard corners except where function demands them (the square Baduk board).

- Moon-jar lounge chair: a shell in Purple Silk.
- Credenza: low and long, with a gently convex front and a single light line at its base.
- Baduk table: a round "pebble" table with the square board inset (the only hard geometry in the room).
- Record plinth: curved, round platter.
- Moon jar: the hero, with its seam and its imperfection.
- Rug: round, cashmere.
- The Neolun Arch Gate: one arched opening at the far end of the greenhouse, revealed when chapter 2 (The Architecture of Welcome) arrives.

## 5. Light: "Two Lines"

The brief calls for "invisible, indirect ambient illumination" and describes the front lamps as the "two-line lamps". So: exactly **two** concealed linear lights, in amber, one along the ridge of the vault and one along the floor edge. They wash the ribs and floor with a glow map under the sharp lines, breathe very slowly, and **brighten as chapters arrive** (replacing the old lamp-strength mechanic). The table lamp goes. A tiny pilot light on the record player and a thin edge on the Baduk board are the only other lights.

## 6. Grounding the interactions (and the claims we must not make)

- **Record player = the audio hub.** Records appear as chapters unlock and shift with time of day, which is a natural reason to return. **[verify]** "Modern Korean indie" is licensed music, not free: until the music is formally decided the placeholder set stays.
- **Baduk = a minimalist opponent.** The "predictive" feeling comes from a faint afterimage of the point the opponent considered (a ring that fades in under half a second). It is a feeling only: **no copy or UI may claim anything about the car's software.** Still no score and no result.
- **The folk tale.** The honest tie is the **moon**: the brief gives "Neolun" as neo + luna (moon), and the tale ends with a sister who becomes the moon. The **door** tie (Neolun Arch Gate coach doors, Son-nim: passengers as honoured guests) is real in chapter 2, but the brief bars Son-nim and the Neolun etymology from the teaser, so it appears **only after chapter 2 unlocks**, and only as imagery. Any text linking the tale to coach doors is a product claim (flag `fact-claim`) and needs client approval. Note that in the tale itself the door is where the danger comes in; frame it as a threshold, not a welcome.
- "Beauty of White Space": confirmed as Genesis's own phrase for its interior principle (brand page and newsroom, section 8). The brief does not use it, so it guides the design of the room and is **not** copy. The Korean rendering (yeobaek-ui mi) is my gloss and needs a native check before any use.

## 7. Budget and success

Scene pack under 250 KB; a steady 60 fps on a mid-range phone; works with no motion permission; reduced-motion respected; checked at 390 x 844 and 320 x 568; every string still comes from `content.json` with a provenance tag; nothing here is a claim about the car.

## 8. References (under vetting)

Sixteen candidates sit on the GV90 Inspiration Board (a private artifact; marks are saved per person). Each card records how closely it was read: **read** (page opened and read), **snippet** (search result text only), or **blocked** (page refused me; unverified). Nothing is copied into the work.

**Genesis primary sources (read)**
- Neolun concept page, genesis.com: Midnight Black / Majestic Blue exterior; Royal Indigo cashmere and Purple Silk leather interior, dyed with Korean natural pigments; Seoul at night reflected on a moon jar beside the two-line design.
- Genesis brand page: the two lines, reductive design, "Beauty of White Space".
- Genesis newsroom, Neolun at the Cheongju Craft Biennale: three Korean makers (stitched landscape, moon jars, blown glass); hanok sliding doors and ondol as touchstones.
- Sotheby's on Genesis House, New York: the threshold and the garden larger than its plot.

**Illustration and games (snippet only):** Kentucky Route Zero, Monument Valley, Alto's Odyssey; plus one **avoid** card (generic stock vector night skylines).
**Interactive mechanics:** Poison Studio and Mt. Fuji stamps (read); Porschevolution and the BMW 3 Series launch (snippet only).
**Moon jar and craft:** Salon 94 Design's contemporary moon jars (read); Zong-Sun Bahk's lighting (snippet only); The Met and the Art Institute of Chicago moon jars (**blocked**: check each object's Open Access flag before any image is used, and ask before downloading anything).

**Vetting result (2026-10-07, one reviewer, no notes left).** Keep: Neolun concept page, brand page (Two Lines, white space), Cheongju Biennale makers, Mt. Fuji layered parallax. Maybe: Genesis House, Salon 94 moon jars, BMW 3 Series pan. Cut: both museum moon-jar pages (so no image downloads are needed), Poison Studio, Porschevolution, Zong-Sun Bahk. The four illustration references (Kentucky Route Zero, Monument Valley, Alto's Odyssey, the "avoid" card) were left unmarked, so the Keeps settle palette, light and structure but **not the line quality**.

**Open gap:** a strong reference for precise, hairline vector-noir *interiors*. Searches returned generic stock skylines. This needs the team's own picks (artists, Behance, Dribbble, Instagram).

## 9. Style frames (look-dev, generated)

`node scripts/vector/frames.mjs` writes three SVG frames to `docs/style-frames/` (390 x 844 crop of the 2026 x 844 world, object positions from `glasshouse.manifest.json`); `node scripts/vector/render.mjs <svgDir> <pngDir>` renders PNGs with Playwright. The three treatments share one scene and differ only in line and fill language:

| Frame | Treatment | Notes |
| --- | --- | --- |
| A Hairline | line only, fills only as light | purest; no warmth at all |
| B Planes | no outlines, flat planes | boldest; drops the brand's lines |
| C Line and light | three line tiers over gradients, rim light | most room-like; glow uses `mix-blend-mode: screen` (needs a speed check on a mid-range phone) |

Measured from the rendered pixels (frames at 2x, downsampled, classified by hue): amber including glow is about 1.2% of the frame (limit 4%), the two lines alone about 0.4%. The **60/30/10 balance is not met** in this crop: A is 96% indigo and ink with 2.5% violet; B and C are about 86% indigo and ink, 6 to 7% violet and silk, 6% white. (A first version of this note said 3 to 5% violet: the classifier only counted violet above a lightness threshold, so dark silk was counted as indigo. Corrected 8 October.) Each frame is 23 to 26 KB. Layer groups are named after manifest ids (`sky`, `hills`, `glass`, `ribs`, `floorlight`, `credenza`, `jar`, `fern_front`, `light`) so each can become a parallax layer.

**Decision (8 October):** Joel marked B (Planes) Keep, A and C Maybe. Answers: keep the jar's imperfection as drawn; add the rug and enlarge the credenza and re-measure; stay generated, with Claude tuning to notes; decide alternate-pack vs replace after seeing a full panorama in B.

## 10. The room in Planes (full panorama)

**Round one (7 Oct)** was flat elevations: Joel's notes were "flat, not on an angle, feels like I can't sit there" (chair), "just looks like a piece of paper" (Baduk), "ugly, not inviting to touch, pages are blank" (screen), "can't see the book" (tea table), "flat" (rug), and overall "good start, I like the mood, feels really flat and not dynamic". Good: credenza, jar, plants, the two lines. His answers: alternate scene (yes), silk floor with the chair and credenza lifted, leave the light 10% alone.

**Round two (8 Oct)** answers each note. `scripts/vector/solid.mjs` is a small flat-shaded renderer (boxes, cylinders and strips seen from one low pitch of 13 degrees, painted in lit / mid / dark tones by face direction, no outlines). The chair is turned 30 degrees toward the table as a tub shell with a cushion; the Baduk table has a thick wooden goban and two bowls; the folding screen is six hinged, framed panels in a zigzag lit from the ridge; the tale book has a taupe cover, cream pages and a gold label; the rug has an edge; the desk has drawers and books. The floor is Purple Silk (`FLOOR=ink` restores the dark floor). Motion: rain, a turning record, swaying leaves, breathing lines (CSS; off under reduced motion).

`node scripts/vector/panorama.mjs` writes the preview (`docs/style-frames/panorama-b-planes.svg`, 123 KB, with placeholder posters, board grid and rain). `node scripts/vector/pack.mjs` writes the **scene pack** the app loads with `?scene=vector` (27 SVG layers, 146 KB, plus `src/room/glasshouse.vector.manifest.json`); layer boxes are measured in a headless browser, ids and hit areas match the 3D room, the poster quads and Baduk quad are read from its manifest and left blank for the app to draw on. Verified in the app at 390 x 844: the layers load with no errors, the record turns and the tonearm swings, the Baduk table opens a game, a poster opens its chapter, the tale book and jar respond.

| Palette share (by hue) | Indigo + ink | Violet + silk | White + cashmere |
| --- | --- | --- | --- |
| Round one, ink floor, whole room | 85.5% | 10.3% | 3.3% |
| Round two, silk floor, whole room | 62.8% | 32.5% | 3.6% |
| Round two, silk floor, home view | 66.8% | 25.6% | 4.8% |

Not done: tea set, a tuned late and dusk sky (the app opens on "late"), a real light-lines-brighten-as-chapters-arrive mechanic, speed check of the screen-blended glow on a mid-range phone. Review page (round two): https://claude.ai/artifact/JwD9npPrPehzG9ZJXNPFUq

**Decision (8 October, after round two):** Joel marked all ten objects Good, answered "Yes: it feels like a place now", and chose to make the vector room the **default scene**, with the Blender render kept at `?scene=3d` (`?scene=vector` still works and means the default). Done in `GlasshouseRoom.tsx`; the public build, which has no render, shows the vector room either way. Next in line: tune the late and dusk skies (the app opens on "late"), the light lines brightening as chapters arrive, the tea set, and a speed check of the screen-blended glow on a real phone.

**Rain fix (8 October, from Joel's note: "eventually the droplets look big, and inside of the room").** Two causes, both mine or latent. (1) `GlassRain.tsx` let a bead grow without limit until it could run, and only seven runners are allowed, so after a few minutes most beads kept swelling into big rings; beads now stop at the size at which they would run (this also fixes the 3D scene). The vector scene also draws smaller drops (`rain.dropScale` 0.6 in its manifest). (2) The pack's glass mask is meant to cut furniture out of the rain, but its style rule was written against an id that the id-prefixing step renamed, so light furniture was not cut out and drops landed on the chair; the rule is now class-based. Checked by fast-forwarding the page clock three minutes before and after.
