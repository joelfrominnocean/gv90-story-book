// Export the room as a scene pack the app can swap in: one small SVG per layer + a manifest in the 3D room's own schema.
//   node scripts/vector/pack.mjs
//   -> public/assets/room/vector/<id>.svg   and   src/room/glasshouse.vector.manifest.json
// Open the app with ?scene=vector. Ids, hit areas, poster quads and the Baduk board quad match the 3D room, so everything the
// room does (posters open chapters, the record turns, the book opens the tale, the board takes a game) works on this art.
// The poster faces and the board's lines and stones are NOT drawn here: the app draws them live over the quads.
process.env.MODE = 'pack';
import fs from 'node:fs';
import path from 'node:path';
const { layers, CSS, defs, G, W, H, manifest, prefix, xa, xb, previewSvg } = await import('./panorama.mjs');
const { chromium } = await import('playwright');
const { C, mix, n } = await import('./tokens.mjs');

const OUT = 'public/assets/room/vector', MAN_OUT = 'src/room/glasshouse.vector.manifest.json';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

/* Layer boxes are MEASURED, not guessed: draw the whole room once in a headless browser and read each group's real extent. */
{
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: 'reduce' })).newPage();
  await page.setContent(`<!doctype html><body style="margin:0">${previewSvg()}</body>`);
  const ids = ['camellia', 'bonsai', 'screen', 'credenza', 'tt_base', 'sleeve', 'tea', 'book', 'jar', 'chair', 'coffee', 'desk', 'fern_front', 'rug'];
  const got = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => { const r = document.getElementById('p-' + id).getBoundingClientRect(); return [id, [r.left, r.top, r.right, r.bottom]]; })), ids);
  await browser.close();
  for (const id of ids) { const m = id === 'book' ? 3 : 10; layers[id].box = [got[id][0] - m, got[id][1] - m, got[id][2] + m, got[id][3] + m]; }
}

const d = defs();
const defLines = new Map();                                       // id -> one <defs> child, so each layer carries only what it uses
d.text.split('\n').filter((l) => /^\s+<(linearGradient|radialGradient|mask|clipPath|path|pattern)\b/.test(l)).forEach((l) => defLines.set(l.match(/\bid="([^"]+)"/)[1], l));
const usedDefs = (svg) => {
  const need = new Set(), q = [svg];
  while (q.length) for (const m of q.pop().matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)) { const id = m[1] || m[2]; if (!need.has(id) && defLines.has(id)) { need.add(id); q.push(defLines.get(id)); } }
  return [...need].map((id) => defLines.get(id)).join('\n');
};
const animated = (svg) => /class="(breath|sway)/.test(svg);

const wrap = (id, svg, box, extraDefs = '') => {
  const [x0, y0, x1, y1] = box.map((v) => +v.toFixed(2)), w = +(x1 - x0).toFixed(2), h = +(y1 - y0).toFixed(2);
  const dd = [usedDefs(svg), extraDefs].filter(Boolean).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${w}" height="${h}">${animated(svg) ? `<style>${CSS}</style>` : ''}${dd ? `<defs>\n${dd}\n</defs>` : ''}${svg}</svg>\n`;
};

/* three skies, because the room crossfades between them as chapters arrive (late is where it begins) */
const skyFor = (id, top, mid, hor, moonOp) => {
  const g = `<linearGradient id="${id}G" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${hor}"/></linearGradient>`;
  const body = `<rect x="${xa - 200}" y="0" width="${xb - xa + 400}" height="${G.floorY}" fill="url(#${id}G)"/>
<rect x="${xa - 200}" y="${G.floorY - 120}" width="${xb - xa + 400}" height="120" fill="url(#haze)"/>
<g fill-opacity="${moonOp}"><circle cx="${G.moon.x}" cy="${G.moon.y}" r="130" fill="url(#moonHalo)"/><circle cx="${G.moon.x}" cy="${G.moon.y}" r="${G.moon.r}" fill="${C.white}"/></g>`;
  return { svg: prefix(wrap(id, body, [xa - 200, 0, xb + 200, G.floorY], g), id + '-'), box: [xa - 200, 0, xb + 200, G.floorY] };
};
const skies = {
  sky_late: skyFor('skylate', mix(C.royal, C.majestic, 0.4), mix(C.majestic, C.violet, 0.4), mix(C.violet, C.cashmere, 0.45), 0.35),
  sky_dusk: skyFor('skydusk', mix(C.ink, C.royal, 0.55), mix(C.royal, C.silk, 0.45), mix(C.silk, C.majestic, 0.45), 0.7),
  sky_night: skyFor('skynight', mix(C.ink, C.royal, 0.1), mix(C.ink, C.royal, 0.95), mix(C.royal, C.majestic, 0.6), 1),
};

/* the vignette: a little dark at the edges, and more at the foot where the words sit */
const vignette = `<defs><linearGradient id="vx" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.ink}" stop-opacity=".62"/><stop offset=".12" stop-color="${C.ink}" stop-opacity="0"/><stop offset=".88" stop-color="${C.ink}" stop-opacity="0"/><stop offset="1" stop-color="${C.ink}" stop-opacity=".62"/></linearGradient><linearGradient id="vy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.ink}" stop-opacity=".4"/><stop offset=".14" stop-color="${C.ink}" stop-opacity="0"/><stop offset=".72" stop-color="${C.ink}" stop-opacity="0"/><stop offset="1" stop-color="${C.ink}" stop-opacity=".72"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#vx)"/><rect width="${W}" height="${H}" fill="url(#vy)"/>`;

/* the glass mask: where rain may fall = the glass wall, minus everything standing in front of it */
const occluders = ['screen', 'bonsai', 'camellia', 'credenza', 'tt_base', 'tt_platter', 'tt_arm', 'sleeve', 'tea', 'book', 'jar', 'desk', 'chair'];
const blob = (id) => { const [x0, y0, x1, y1] = layers[id].box; return `<ellipse cx="${n((x0 + x1) / 2)}" cy="${n((y0 + y1) / 2)}" rx="${n((x1 - x0) * 0.46)}" ry="${n((y1 - y0) * 0.46)}"/>`; };
const carve = occluders.map((id) => (id === 'camellia' || id === 'bonsai' ? blob(id) : `<g>${layers[id].svg}</g>`)).join('');
const maskDefs = occluders.filter((id) => id !== 'camellia' && id !== 'bonsai').map((id) => usedDefs(layers[id].svg)).filter(Boolean);
const glassmask = `<defs>${[...new Set(maskDefs.join('\n').split('\n'))].join('\n')}<style>.carve *{fill:#000 !important;stroke:none !important;fill-opacity:1 !important;opacity:1 !important}</style><mask id="gm" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><g class="carve">${carve}</g></mask></defs><g mask="url(#gm)"><rect x="0" y="${G.ridgeY}" width="${W}" height="${G.floorY - G.ridgeY}" fill="#fff"/></g>`;

/* z-order, depth factor and kind for each layer; ids match the 3D room wherever the room does something with them */
const SPEC = [
  ['hills', 1, 'object'], ['floor', 5, 'floor'], ['glass', 6, 'object'], ['ribs', 7, 'object'], ['floorlight', 8, 'object'], ['rug', 9, 'object'],
  ['camellia', 11, 'object'], ['bonsai', 12, 'object'], ['screen', 14, 'object'], ['credenza', 16, 'object'], ['tt_base', 17, 'object'], ['tt_platter', 18, 'platter'], ['tt_arm', 19, 'arm'],
  ['sleeve', 20, 'object'], ['tea', 24, 'object'], ['book', 25, 'object'], ['jar', 26, 'object'], ['chair', 28, 'object'], ['coffee', 29, 'object'], ['desk', 34, 'object'], ['fern_front', 40, 'object'], ['light', 45, 'object'],
];
const orig = new Map(manifest.layers.map((l) => [l.id, l]));
const norm = (b) => [+(b[0] / W).toFixed(5), +(b[1] / H).toFixed(5), +(b[2] / W).toFixed(5), +(b[3] / H).toFixed(5)];
const out = [];
const put = (id, svg, box, meta) => {
  fs.writeFileSync(path.join(OUT, `${id}.svg`), svg);
  out.push({ id, box: norm(box), par: 1, z: 0, kind: 'object', ...meta, src: `/assets/room/vector/${id}.svg` });
};
[['sky_late', 'late'], ['sky_dusk', 'dusk'], ['sky_night', 'night']].forEach(([id, state]) => put(id, skies[id].svg, skies[id].box, { par: 0.72, z: 0, kind: 'sky', state }));
for (const [id, z, kind] of SPEC) {
  const L = layers[id], meta = { par: L.par, z, kind };
  const o = orig.get(id);
  if (id === 'tt_arm') meta.pivot = [0.1, 0.5];
  if (['sleeve', 'jar'].includes(id)) { meta.interact = id; meta.hit = o.hit; }
  if (id === 'book') { meta.interact = 'tale'; meta.hit = norm([L.box[0] + 4, L.box[1] + 4, L.box[2] - 4, L.box[3] - 4]); }
  if (id === 'coffee') { meta.interact = 'baduk'; meta.hit = norm([396, 556, 790, 748]); }
  put(id, prefix(wrap(id, L.svg, L.box), id + '-'), L.box, meta);
}
put('glassmask', prefix(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${glassmask}</svg>\n`, 'gm-'), [0, 0, W, H], { z: 50, kind: 'mask' });
put('frame', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${vignette}</svg>\n`, [0, 0, W, H], { z: 52, kind: 'frame' });

const man = {
  aspect: manifest.aspect, layers: out, posters: manifest.posters,
  tt: { squash: 0.24, armPlay: manifest.tt.armPlay, armRest: manifest.tt.armRest, armLength: manifest.tt.armLength },
  rain: { dropScale: 0.6 },                            // the glass is across the room, so its beads of water are small
  lamp: { u: -3, v: -3 },                              // the table lamp is gone from this room: park its glow off the frame
  home: manifest.home, baduk: manifest.baduk, focus: manifest.focus, plates: manifest.plates, frame: { w: W, h: H },
};
fs.writeFileSync(MAN_OUT, JSON.stringify(man, null, 1) + '\n');
const total = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`${out.length} layers, ${(total / 1024).toFixed(1)} KB -> ${OUT} and ${MAN_OUT}`);
