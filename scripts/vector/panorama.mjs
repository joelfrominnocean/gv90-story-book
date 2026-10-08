// The full room in the "Planes" treatment: flat shapes, no outlines, light does the drawing.
//   node scripts/vector/panorama.mjs [outDir]            -> one preview SVG (whole room, with placeholder posters, board lines, rain)
//   MODE=pack node scripts/vector/pack.mjs [outDir]      -> one SVG per layer + a manifest, for the app's ?scene=vector
// Object positions come from src/room/glasshouse.manifest.json (the 3D room): poster quads, the Baduk board quad, hit areas.
// In pack mode the poster faces and the board's lines and stones are NOT drawn: the app draws those live.
// Furniture is built with solid.mjs (boxes, cylinders and strips seen from one low camera, painted in three flat tones).
import fs from 'node:fs';
import path from 'node:path';
import { C, mix, n } from './tokens.mjs';
import { P, smooth, jarGeometry, blade } from './geom.mjs';
import { Solid, tri, PITCH } from './solid.mjs';

const out = process.argv[2] || 'docs/style-frames';
const PACK = process.env.MODE === 'pack';
const INK_FLOOR = process.env.FLOOR === 'ink';                     // the chosen floor is silk; ink is kept for comparison
const FLOOR_MIX = (process.env.FLOOR_MIX || '0.12,0.3,0.5').split(',').map(Number);
const manifest = JSON.parse(fs.readFileSync('src/room/glasshouse.manifest.json', 'utf8'));
const W = 2026, H = 844, CP = Math.cos(PITCH), SQ = Math.sin(PITCH);
const world = (u, v) => [u * W, v * H];

const G = {
  ridgeY: 34, floorY: 500, transomY: 330, upstandH: 18,
  mullionX: Array.from({ length: 14 }, (_, k) => 65 + 150 * k),
  arc: { cx: 1000, cy: 500, radii: [470, 560] },
  moon: { x: 1174, y: 140, r: 24 },
  jar: { cx: 1277.5, base: 633, rb: 84.5 },
};

/* ---------- tones: every fill is a mix of the eight palette colours ---------- */
const T = {
  wall: mix(C.ink, C.royal, 0.35),
  silk: C.silk, silkDark: mix(C.silk, C.ink, 0.5), silkMid: mix(C.silk, C.ink, 0.25), silkLit: mix(C.silk, C.violet, 0.45),
  // lifted against the silk floor so the chair and credenza stand out (Joel's answer to question 2)
  lift: tri(mix(C.silk, C.violet, 0.78), mix(C.silk, C.violet, 0.42), mix(C.silk, C.violet, 0.1)),
  liftIn: tri(mix(C.violet, C.cashmere, 0.12), mix(C.silk, C.violet, 0.5), mix(C.silk, C.violet, 0.22)),
  frame: tri(mix(C.silk, C.ink, 0.3), mix(C.silk, C.ink, 0.5), mix(C.silk, C.ink, 0.68)),
  royal: tri(mix(C.royal, C.majestic, 0.3), C.royal, mix(C.royal, C.ink, 0.5)),
  pedestal: tri(mix(C.royal, C.violet, 0.4), mix(C.royal, C.silk, 0.45), mix(C.royal, C.ink, 0.5)),
  table: tri(mix(C.silk, C.violet, 0.5), mix(C.silk, C.ink, 0.1), mix(C.silk, C.ink, 0.5)),
  drum: tri(mix(C.silk, C.violet, 0.4), mix(C.silk, C.ink, 0.15), mix(C.silk, C.ink, 0.5)),
  wood: tri(mix(mix(C.cashmere, C.amber, 0.35), C.ink, 0.12), mix(mix(C.cashmere, C.amber, 0.35), C.ink, 0.34), mix(mix(C.cashmere, C.amber, 0.35), C.ink, 0.56)),
  cushion: tri(mix(C.cashmere, C.white, 0.05), mix(C.cashmere, C.ink, 0.2), mix(C.cashmere, C.ink, 0.46)),
  cover: tri(mix(C.cashmere, C.ink, 0.3), mix(C.cashmere, C.ink, 0.46), mix(C.cashmere, C.ink, 0.64)),
  pages: tri(mix(C.white, C.cashmere, 0.15), mix(C.white, C.cashmere, 0.32), mix(C.cashmere, C.white, 0.1)),
  leaf: mix(C.ink, C.royal, 0.62), leafLit: mix(C.royal, C.majestic, 0.3),
  plinth: mix(C.ink, C.royal, 0.55), plinthLit: mix(C.royal, C.majestic, 0.2),
  paper: mix(C.cashmere, C.white, 0.3), ink: mix(C.ink, C.royal, 0.4), gold: mix(C.cashmere, C.amber, 0.45),
  rugBody: mix(mix(C.cashmere, C.amber, 0.18), C.ink, 0.5), rugEdge: mix(mix(C.cashmere, C.amber, 0.18), C.ink, 0.4),
  shadow: C.ink,
};

/* ---------- small drawing helpers (all fills; strokes only for the two light lines and the preview's board grid) ---------- */
const rr = (x, y, w, h, r, fill, op = 1) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${r}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`;
const ell = (cx, cy, rx, ry, fill, op = 1) => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`;
const poly = (pts, fill, op = 1) => `<polygon points="${pts.map((p) => P(...p)).join(' ')}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''}/>`;
const pth = (d, fill, op = 1, extra = '') => `<path d="${d}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ''} ${extra}/>`;
const lineEl = (x1, y1, x2, y2, col, sw, op = 1) => `<path d="M${P(x1, y1)}L${P(x2, y2)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-opacity="${op}" stroke-linecap="round"/>`;
const shadow = (cx, cy, rx, ry, op = 0.6) => ell(cx, cy, rx, ry, T.shadow, op);
const bil = (q, u, v) => { const top = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u], bot = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u]; return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v]; };
const circleIn = (q, u, v, ru, rv, k = 28) => Array.from({ length: k }, (_, i) => bil(q, u + Math.cos((i / k) * 6.2832) * ru, v + Math.sin((i / k) * 6.2832) * rv));

// A closed, softly irregular loop (foliage pad). Deterministic: the same seed always gives the same shape.
function pad(cx, cy, rx, ry, seed) {
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, k = 1 + 0.16 * Math.sin(seed * 1.7 + i * 2.1) + 0.07 * Math.cos(seed + i * 4.3);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  const m = pts.length;
  let d = `M${P(...pts[0])}`;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m], p1 = pts[i], p2 = pts[(i + 1) % m], p3 = pts[(i + 2) % m];
    d += `C${P(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)} ${P(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)} ${P(...p2)}`;
  }
  return d + 'Z';
}

/* ---------- layers: id -> { par, svg, box: [x0, y0, x1, y1] in world units } ---------- */
const layers = {};
const add = (id, par, svg, box) => { layers[id] = { par, svg, box }; };
const xa = -120, xb = W + 120;
const swayCount = { n: 0 };
const sway = (inner, ox, oy) => { const k = (swayCount.n++ % 4) + 1; return `<g class="sway s${k}" style="transform-origin:${n(ox)}px ${n(oy)}px">${inner}</g>`; };

function defs() {
  const jar = jarGeometry({ cx: G.jar.cx, base: G.jar.base, rb: G.jar.rb });
  const f = INK_FLOOR ? [mix(C.ink, C.royal, 0.55), C.ink, '#05071a'] : FLOOR_MIX.map((m) => mix(C.silk, C.ink, m));
  return { jar, text: `<defs>
  <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(C.ink, C.royal, 0.1)}"/><stop offset=".5" stop-color="${mix(C.ink, C.royal, 0.95)}"/><stop offset="1" stop-color="${mix(C.royal, C.majestic, 0.6)}"/></linearGradient>
  <radialGradient id="moonHalo"><stop offset="0" stop-color="${C.white}" stop-opacity=".30"/><stop offset=".35" stop-color="${C.white}" stop-opacity=".10"/><stop offset="1" stop-color="${C.white}" stop-opacity="0"/></radialGradient>
  <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.majestic}" stop-opacity="0"/><stop offset="1" stop-color="${mix(C.majestic, C.white, 0.15)}" stop-opacity=".30"/></linearGradient>
  <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f[0]}"/><stop offset=".45" stop-color="${f[1]}"/><stop offset="1" stop-color="${f[2]}"/></linearGradient>
  <linearGradient id="glowDown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.amber}" stop-opacity=".5"/><stop offset=".07" stop-color="${C.amber}" stop-opacity=".22"/><stop offset=".22" stop-color="${C.amber}" stop-opacity=".07"/><stop offset=".55" stop-color="${C.amber}" stop-opacity=".015"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></linearGradient>
  <linearGradient id="glowUp" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.amber}" stop-opacity=".26"/><stop offset=".25" stop-color="${C.amber}" stop-opacity=".07"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.white}" stop-opacity=".07"/><stop offset="1" stop-color="${C.white}" stop-opacity="0"/></linearGradient>
  <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.amber}" stop-opacity=".22"/><stop offset=".5" stop-color="${C.amber}" stop-opacity=".05"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></linearGradient>
  <linearGradient id="refl" gradientUnits="userSpaceOnUse" x1="0" y1="${G.jar.base}" x2="0" y2="${G.jar.base + 120}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="reflMask" maskUnits="userSpaceOnUse" x="${xa}" y="${G.jar.base}" width="${xb - xa}" height="140"><rect x="${xa}" y="${G.jar.base}" width="${xb - xa}" height="140" fill="url(#refl)"/></mask>
  <clipPath id="jarClip"><path d="${jar.body}"/></clipPath>
  <path id="jarBody" d="${jar.body}"/>
  <pattern id="rainA" width="170" height="150" patternUnits="userSpaceOnUse"><path d="M20 10l-4 22M70 70l-4 24M120 30l-4 20M150 100l-4 22M95 120l-3 16" stroke="${C.white}" stroke-width="1" stroke-linecap="round" fill="none"/></pattern>
  <pattern id="rainB" width="230" height="190" patternUnits="userSpaceOnUse"><path d="M40 20l-5 28M110 90l-5 30M190 50l-5 26M160 150l-5 28M60 140l-4 22" stroke="${C.white}" stroke-width="1.3" stroke-linecap="round" fill="none"/></pattern>
</defs>` };
}

function buildScene() {
  const { jar } = defs();
  const span = xb - xa;
  const core = (y) => lineEl(xa, y, xb, y, C.amber, 1.7) + lineEl(xa, y, xb, y, mix(C.amber, C.white, 0.6), 0.55, 0.9);

  /* sky: the deep background (par .72 in the app) */
  add('sky', 0.72, `<rect x="${xa - 200}" y="0" width="${xb - xa + 400}" height="${G.floorY}" fill="url(#skyG)"/>
<rect x="${xa - 200}" y="${G.floorY - 120}" width="${xb - xa + 400}" height="120" fill="url(#haze)"/>
<circle cx="${G.moon.x}" cy="${G.moon.y}" r="130" fill="url(#moonHalo)"/>
<circle cx="${G.moon.x}" cy="${G.moon.y}" r="${G.moon.r}" fill="${C.white}"/>`, [xa - 200, 0, xb + 200, G.floorY]);

  const hills = (base, amp, seed, step) => { const pts = []; for (let x = xa - 60; x <= xb + 60; x += step) pts.push([x, base + amp * Math.sin(x / 83 + seed) + amp * 0.45 * Math.sin(x / 31 + seed * 2.3)]); return pts; };
  const far = hills(410, 15, 1.2, 70), near = hills(481, 6, 4.1, 70);
  const closeTo = (pts) => `${smooth(pts)}L${P(xb + 60, G.floorY)}L${P(xa - 60, G.floorY)}Z`;
  add('hills', 0.8, pth(closeTo(far), mix(C.royal, C.ink, 0.5)) + pth(closeTo(near), mix(C.ink, C.royal, 0.2)), [xa - 60, 380, xb + 60, G.floorY]);

  add('floor', 1, `<rect x="${xa}" y="${G.floorY}" width="${span}" height="${H - G.floorY + 40}" fill="url(#floorG)"/>`, [xa, G.floorY, xb, H + 40]);

  /* glass wall: mullions, a transom, the stone upstand and a little sheen */
  const gl = [];
  for (const x of G.mullionX) gl.push(lineEl(x, G.ridgeY, x, G.floorY, T.wall, 5));
  gl.push(lineEl(xa, G.transomY, xb, G.transomY, T.wall, 4));
  gl.push(`<rect x="${xa}" y="${G.floorY}" width="${span}" height="${G.upstandH}" fill="${mix(C.ink, C.royal, 0.3)}"/>`);
  for (const x of [330, 760, 1135, 1520, 1860]) gl.push(`<polygon points="${P(x, G.ridgeY)} ${P(x + 54, G.ridgeY)} ${P(x - 118, G.floorY)} ${P(x - 172, G.floorY)}" fill="url(#sheen)"/>`);
  add('glass', 1, gl.join(''), [xa, G.ridgeY - 4, xb, G.floorY + G.upstandH]);

  add('ribs', 1, G.arc.radii.map((r, i) => {
    const lit = i === 0 ? 3.6 : 2.4, rl = r + lit;
    return `<path d="M${P(G.arc.cx - r, G.arc.cy)}A${r} ${r} 0 0 1 ${P(G.arc.cx + r, G.arc.cy)}" fill="none" stroke="${mix(C.ink, C.royal, 0.28)}" stroke-width="${i === 0 ? 9 : 6}"/>` +
           `<path d="M${P(G.arc.cx - rl, G.arc.cy)}A${rl} ${rl} 0 0 1 ${P(G.arc.cx + rl, G.arc.cy)}" fill="none" stroke="${mix(C.majestic, C.white, 0.15)}" stroke-width="1.6" stroke-opacity=".55"/>`;
  }).join(''), [G.arc.cx - 570, -30, G.arc.cx + 570, G.floorY + 6]);

  add('floorlight', 1, `<g style="mix-blend-mode:screen"><g class="breath">
  <rect x="${xa}" y="${G.floorY}" width="${span}" height="110" fill="url(#glowDown)"/>
  <rect x="${xa}" y="${G.floorY - 30}" width="${span}" height="30" fill="url(#glowUp)"/></g></g>${core(G.floorY)}`, [xa, G.floorY - 30, xb, G.floorY + 110]);

  /* rug: round, cashmere, with a visible edge so it lies ON the floor */
  const rug = [ell(770, 735, 410, 94, T.shadow, 0.5)];
  rug.push(pth('M366 726A404 92 0 0 0 1174 726L1174 733A404 92 0 0 1 366 733Z', mix(mix(C.cashmere, C.amber, 0.1), C.ink, 0.66)));
  rug.push(ell(770, 726, 404, 92, T.rugEdge), ell(770, 727, 384, 86, T.rugBody), ell(770, 728, 340, 75, mix(mix(C.cashmere, C.amber, 0.1), C.ink, 0.56)), ell(770, 729, 300, 66, T.rugBody));
  rug.push(pth('M390 700C470 660 600 640 770 638C700 646 560 664 450 718Z', mix(mix(C.cashmere, C.amber, 0.1), C.ink, 0.32), 0.6));
  add('rug', 1, rug.join(''), [350, 620, 1190, 745]);

  /* folding screen: six hinged panels in a zigzag, aligned to the manifest's poster quads. */
  const quads = manifest.posters.map((p) => p.quad.map(([u, v]) => world(u, v)));
  const cx = quads.map((q) => (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4);
  const halfP = (cx[1] - cx[0]) / 2, w = 57.5, ang = (26 * Math.PI) / 180;
  const sx0 = cx[0] - halfP;
  const sc = [shadow((cx[0] + cx[5]) / 2, 543, 170, 8, 0.45)];
  let zc = 0, xc = sx0;
  const panelTones = [tri(mix(C.silk, C.violet, 0.5), mix(C.silk, C.violet, 0.28), C.silk), tri(mix(C.silk, C.violet, 0.2), mix(C.silk, C.ink, 0.22), mix(C.silk, C.ink, 0.5))];
  const yb = 541, hgt = 214;
  const proj = (x, ly, z) => [x, yb - ly * CP + z * SQ];
  const hinges = [];
  for (let i = 0; i < 6; i++) {
    const a = i % 2 === 0 ? ang : -ang, x1 = xc + w * Math.cos(a), z1 = zc + w * Math.sin(a);
    const tone = panelTones[i % 2];
    const f = [proj(xc, 0, zc), proj(x1, 0, z1), proj(x1, hgt, z1), proj(xc, hgt, zc)];
    sc.push(poly(f, tone.mid));
    // an inset, so each panel reads as a framed panel and not a slab
    const fq = [f[3], f[2], f[1], f[0]];
    sc.push(poly([bil(fq, 0.1, 0.05), bil(fq, 0.9, 0.05), bil(fq, 0.9, 0.97), bil(fq, 0.1, 0.97)], i % 2 === 0 ? mix(C.silk, C.violet, 0.4) : mix(C.silk, C.violet, 0.12)));
    sc.push(poly([f[3], f[2], [f[2][0], f[2][1] - 4], [f[3][0], f[3][1] - 4]], tone.lit));           // lit top edge
    hinges.push(proj(x1, 0, z1));
    xc = x1; zc = z1;
  }
  // soft light from the ridge falls on the screen
  sc.push(`<g style="mix-blend-mode:screen"><rect x="${sx0}" y="326" width="${xc - sx0}" height="150" fill="url(#wash)"/></g>`);
  // poster faces: placeholders for the review only. In the app, PosterFace draws these over the quads.
  if (!PACK) {
    const motif = [
      (q) => poly(circleIn(q, 0.5, 0.36, 0.3, 0.17), T.ink) + poly(circleIn(q, 0.62, 0.3, 0.2, 0.11), T.gold),
      (q) => poly(circleIn(q, 0.5, 0.36, 0.34, 0.2), mix(C.white, C.cashmere, 0.2)) + poly([bil(q, 0.1, 0.62), bil(q, 0.9, 0.62), bil(q, 0.9, 0.66), bil(q, 0.1, 0.66)], T.ink),
      (q) => poly([bil(q, 0.2, 0.62), bil(q, 0.2, 0.3), bil(q, 0.5, 0.18), bil(q, 0.8, 0.3), bil(q, 0.8, 0.62)], T.ink) + poly([bil(q, 0.36, 0.62), bil(q, 0.36, 0.36), bil(q, 0.5, 0.28), bil(q, 0.64, 0.36), bil(q, 0.64, 0.62)], T.gold),
      (q) => poly(circleIn(q, 0.5, 0.38, 0.38, 0.22), T.ink) + poly(circleIn(q, 0.5, 0.38, 0.28, 0.16), T.paper) + poly(circleIn(q, 0.5, 0.38, 0.14, 0.08), T.ink),
      (q) => poly([bil(q, 0.12, 0.2), bil(q, 0.34, 0.2), bil(q, 0.34, 0.62), bil(q, 0.12, 0.62)], T.gold) + poly([bil(q, 0.4, 0.2), bil(q, 0.62, 0.2), bil(q, 0.62, 0.62), bil(q, 0.4, 0.62)], T.ink) + poly([bil(q, 0.68, 0.2), bil(q, 0.9, 0.2), bil(q, 0.9, 0.62), bil(q, 0.68, 0.62)], mix(C.cashmere, C.ink, 0.3)),
      (q) => poly([bil(q, 0.1, 0.6), ...Array.from({ length: 13 }, (_, i) => bil(q, 0.5 - Math.cos((i / 12) * Math.PI) * 0.4, 0.6 - Math.sin((i / 12) * Math.PI) * 0.26))], T.gold) + poly([bil(q, 0.04, 0.6), bil(q, 0.96, 0.6), bil(q, 0.96, 0.64), bil(q, 0.04, 0.64)], T.ink),
    ];
    quads.forEach((q, i) => {
      sc.push(poly(q, T.paper));
      sc.push(motif[i](q));
      sc.push(poly([bil(q, 0.18, 0.78), bil(q, 0.82, 0.78), bil(q, 0.82, 0.82), bil(q, 0.18, 0.82)], T.ink, 0.85), poly([bil(q, 0.3, 0.88), bil(q, 0.7, 0.88), bil(q, 0.7, 0.91), bil(q, 0.3, 0.91)], T.ink, 0.6));
    });
  }
  hinges.slice(0, 5).forEach(([hx, hy]) => sc.push(rr(hx - 3, hy - 1, 6, 6, 1.5, mix(C.silk, C.ink, 0.65))));
  add('screen', 1, sc.join(''), [sx0 - 12, 322, xc + 12, 552]);

  /* bonsai and camellia: dark foliage, a lit plane per leaf, quiet pots; they sway a little */
  const bo = [shadow(575, 584, 62, 7)];
  const trunk = 'M580 553C566 522 586 500 566 468C554 446 552 430 560 410L570 414C566 432 570 444 580 462C598 494 588 526 592 553Z';
  bo.push(pth(trunk, mix(C.ink, C.silk, 0.34)));
  bo.push(pth('M572 470C556 468 540 466 530 462L532 457C546 460 560 462 574 463Z', mix(C.ink, C.silk, 0.34)), pth('M582 482C596 476 606 470 614 462L618 467C608 475 598 483 586 488Z', mix(C.ink, C.silk, 0.34)));
  const pads = [[558, 408, 33, 14, 1, -6], [526, 458, 28, 10, 2, 5], [616, 458, 32, 11, 3, -4], [596, 508, 20, 8, 4, 4]].map(([x, y, rx, ry, sd, rot]) => `<g transform="rotate(${rot} ${x} ${y})">${pth(pad(x, y, rx, ry, sd), T.leaf)}${pth(pad(x - rx * 0.1, y - ry * 0.3, rx * 0.7, ry * 0.45, sd + 5), T.leafLit, 0.8)}</g>`);
  bo.push(sway(pads.join(''), 575, 540));
  bo.push(pth('M530 548H620L612 583H538Z', T.silkMid) + pth('M530 548H575L570 583H538Z', T.silk, 0.9) + rr(528, 544, 94, 7, 3, T.silkLit));
  add('bonsai', 1, `<g transform="translate(46 0)">${bo.join('')}</g>`, [470, 395, 690, 590]);

  const ca = [shadow(447, 568, 74, 7)];
  const leaves = [[-78, 205, 34], [-52, 222, 36], [-26, 235, 38], [-4, 246, 40], [20, 238, 38], [46, 224, 36], [72, 206, 34], [-66, 150, 30], [60, 150, 30]];
  const leafSvg = leaves.map(([deg, len, wd]) => {
    const a = (deg * Math.PI) / 180, base = [447, 546], tip = [447 + Math.sin(a) * len * 0.86, 546 - Math.cos(a) * len * 0.86];
    const b = blade(base, tip, wd, deg < 0 ? 0.1 : -0.1);
    return pth(b.outline, T.leaf) + pth(b.halfR, T.leafLit, 0.85);
  });
  ca.push(sway(leafSvg.join(''), 447, 546));
  ca.push(pth('M410 540H484L476 568H418Z', T.silkMid) + pth('M410 540H446L442 568H418Z', T.silk, 0.9) + rr(407, 536, 80, 7, 3, T.silkLit));
  add('camellia', 1, `<g transform="translate(-56 0)">${ca.join('')}</g>`, [280, 300, 480, 580]);

  /* credenza: lifted against the silk floor. (Marked Good: the shape is unchanged.) */
  const cz = [shadow(1015, 614, 218, 9, 0.7)];
  cz.push(rr(836, 592, 12, 20, 2, T.silkDark), rr(1182, 592, 12, 20, 2, T.silkDark));
  cz.push(rr(811, 490, 408, 106, 6, mix(C.silk, C.violet, 0.2)));
  [0, 1, 2].forEach((i) => cz.push(rr(823 + i * 130, 502, 122, 82, 4, i === 1 ? mix(C.silk, C.violet, 0.34) : mix(C.silk, C.violet, 0.24))));
  cz.push(rr(811, 474, 408, 18, 5, mix(C.silk, C.violet, 0.78)), rr(811, 474, 408, 3, 1.5, mix(C.violet, C.cashmere, 0.25)));
  add('credenza', 1, cz.join(''), [800, 466, 1230, 622]);

  /* record player: plinth, a platter that turns (a circle the app squashes), a tonearm that swings, a sleeve */
  const plinth = [rr(920, 446, 140, 34, 8, T.plinth), rr(920, 446, 140, 8, 4, T.plinthLit)];
  add('tt_base', 1, plinth.join(''), [912, 438, 1068, 486]);
  const platterArt = `<circle cx="45" cy="45" r="45" fill="${C.ink}"/><circle cx="45" cy="45" r="31" fill="none" stroke="${mix(C.ink, C.royal, 0.5)}" stroke-width="1.2"/><circle cx="45" cy="45" r="15" fill="${T.cushion.mid}"/><circle cx="45" cy="45" r="2.4" fill="${C.ink}"/><path d="M45 45L88 28A46 46 0 0 1 88 62Z" fill="${C.white}" fill-opacity=".12"/>`;
  add('tt_platter', 1, `<g transform="translate(931 410.5)">${PACK ? platterArt : `<g transform="translate(45 45) scale(1 .24) translate(-45 -45)"><g class="spin" style="transform-origin:45px 45px">${platterArt}</g></g>`}</g>`, [931, 410.5, 1021, 500.5]);
  const armArt = `<path d="M7 8L64 9.4L64 10.6L7 12Z" fill="${mix(C.white, C.ink, 0.3)}"/><rect x="61" y="6.5" width="8" height="7" rx="1.5" fill="${mix(C.white, C.ink, 0.45)}"/><circle cx="7" cy="10" r="6.4" fill="${mix(C.white, C.ink, 0.5)}"/><circle cx="7" cy="10" r="2.4" fill="${C.ink}"/><rect x="0" y="6.8" width="5" height="6.4" rx="1.4" fill="${mix(C.white, C.ink, 0.55)}"/>`;
  add('tt_arm', 1, PACK ? `<g transform="translate(1033 430)">${armArt}</g>` : `<g transform="translate(1040 440) scale(1 .24) rotate(131) translate(-7 -10)">${armArt}</g>`, PACK ? [1033, 430, 1103, 450] : [1000, 436, 1050, 456]);
  add('sleeve', 1, rr(1080, 422, 60, 60, 2, T.paper) + ell(1110, 452, 19, 19, C.ink) + ell(1110, 452, 6, 6, T.cushion.lit), [1076, 418, 1144, 486]);

  /* tea table: a drum, with the tale book where you can see it */
  const tea = new Solid(934, 637, 0, 1);
  tea.cyl(0, 0, 0, 98, 98, 108, T.drum, { topLevel: 'lit' });
  const [bx, by] = tea.at(0, 108, 0);
  const book = new Solid(bx, by, 12, 1.25);
  book.box(-4, 0, 2, 112, 3, 78, T.cover);
  book.box(-2, 3, 2, 106, 10, 72, T.pages);
  book.box(-4, 13, 2, 112, 3, 78, T.cover);
  const lab = mix(C.cashmere, C.ink, 0.74);
  book.face([[-34, 16.2, 14], [30, 16.2, 14], [30, 16.2, -20], [-34, 16.2, -20]], tri(lab, lab, lab), { level: 'lit', bias: 6 });
  book.face([[-26, 16.4, 4], [22, 16.4, 4], [22, 16.4, 0], [-26, 16.4, 0]], tri(T.gold, T.gold, T.gold), { level: 'lit', bias: 8 });
  add('tea', 1, shadow(934, 650, 112, 9, 0.7) + tea.svg(), [828, 500, 1042, 660]);
  add('book', 1, book.svg(), book.bbox(3));

  /* the moon jar: the hero (marked Good, unchanged) */
  const cxj = G.jar.cx, bj = G.jar.base, jp = [];
  jp.push(ell(cxj + 4, bj + 3, 74, 7, T.shadow, 0.75));
  jp.push(`<g mask="url(#reflMask)" transform="translate(0 ${2 * bj}) scale(1 -1)"><use href="#jarBody" fill="${C.white}" fill-opacity=".16"/></g>`);
  jp.push(`<use href="#jarBody" fill="${mix(C.violet, C.silk, 0.2)}"/>`);
  jp.push(`<circle clip-path="url(#jarClip)" cx="${n(cxj - 42)}" cy="${n(bj - 118)}" r="104" fill="${C.white}"/>`);
  jp.push(ell(jar.rim.cx, jar.rim.cy, jar.rim.rx - 1, jar.rim.ry - 0.5, mix(C.violet, C.silk, 0.55)));
  jp.push(`<path d="${jar.seam}" fill="none" stroke="${C.violet}" stroke-width="1" stroke-opacity=".5" stroke-linecap="round"/>`);
  add('jar', 1, jp.join(''), [1180, 436, 1376, 770]);

  /* desk: a writing desk with drawers and a stack of books */
  const dk = new Solid(1534, 637, 0, 1);
  const legT = tri(mix(C.silk, C.violet, 0.3), mix(C.silk, C.ink, 0.3), mix(C.silk, C.ink, 0.55));
  [[-110, -36], [110, -36], [-110, 38], [110, 38]].forEach(([x, z]) => dk.box(x, 0, z, 9, 72, 9, legT));
  dk.box(0, 44, -2, 232, 32, 88, T.lift);
  dk.box(0, 76, 0, 254, 10, 100, T.lift);
  const dr = mix(C.silk, C.violet, 0.52);
  [[-58, 100], [58, 100]].forEach(([x, wd]) => { dk.face([[x - wd / 2 + 5, 47, 42.2], [x + wd / 2 - 5, 47, 42.2], [x + wd / 2 - 5, 72, 42.2], [x - wd / 2 + 5, 72, 42.2]], tri(dr, dr, dr), { level: 'mid' }); dk.box(x, 56, 43.4, 10, 6, 3, T.cushion); });
  dk.box(-78, 86, 6, 100, 9, 66, tri(mix(C.cashmere, C.white, 0.1), mix(C.cashmere, C.ink, 0.28), mix(C.cashmere, C.ink, 0.5)));
  dk.box(-76, 95, 6, 90, 8, 60, tri(mix(C.royal, C.majestic, 0.4), C.royal, mix(C.royal, C.ink, 0.5)));
  dk.box(-80, 103, 4, 76, 8, 52, tri(mix(C.silk, C.violet, 0.7), mix(C.silk, C.violet, 0.35), C.silk));
  add('desk', 1.1, shadow(1534, 644, 150, 9, 0.7) + dk.svg(), [1380, 470, 1690, 656]);

  /* chair: a lounge shell in Purple Silk, turned toward the table, with a cashmere cushion you can see you could sit in */
  const ch = new Solid(759, 696, -30, 1.22);
  const legC = tri(mix(C.silk, C.violet, 0.25), mix(C.silk, C.ink, 0.35), mix(C.silk, C.ink, 0.6));
  [[-62, -52], [62, -52], [-62, 52], [62, 52]].forEach(([x, z]) => ch.box(x, 0, z, 7, 26, 7, legC));
  ch.box(0, 24, 0, 156, 12, 130, T.frame);
  ch.box(0, 36, 2, 146, 20, 122, T.cushion);
  ch.box(0, 56, 2, 134, 6, 110, tri(mix(C.cashmere, C.white, 0.18), mix(C.cashmere, C.white, 0.05), T.cushion.mid));
  const Rr = 88, Rin = 80, zc2 = -4, N = 24, b0 = 26;
  const hOf = (a) => 44 + 112 * Math.max(0, Math.cos(a * 0.92));
  const pt = (a, r, y) => [r * Math.sin(a), y, zc2 - r * Math.cos(a)];
  const A0 = (-96 * Math.PI) / 180, A1 = (96 * Math.PI) / 180;
  const rim = mix(C.violet, C.cashmere, 0.25);
  for (let i = 0; i < N; i++) {
    const a0 = A0 + ((A1 - A0) * i) / N, a1 = A0 + ((A1 - A0) * (i + 1)) / N, am = (a0 + a1) / 2;
    const h0 = b0 + hOf(a0), h1 = b0 + hOf(a1);
    ch.face([pt(a0, Rr, b0), pt(a1, Rr, b0), pt(a1, Rr, h1), pt(a0, Rr, h0)], T.lift, { normal: [Math.sin(am), 0, -Math.cos(am)], bias: 3 });
    ch.face([pt(a0, Rin, b0), pt(a1, Rin, b0), pt(a1, Rin, h1), pt(a0, Rin, h0)], T.liftIn, { normal: [-Math.sin(am), 0, Math.cos(am)], bias: -60 });
    ch.face([pt(a0, Rr, h0), pt(a1, Rr, h1), pt(a1, Rin, h1), pt(a0, Rin, h0)], tri(rim, rim, mix(C.violet, C.cashmere, 0.1)), { normal: [0, 1, 0], level: 'lit', bias: 4 });
  }
  [A0, A1].forEach((a, k) => { const h = b0 + hOf(a); ch.face([pt(a, Rr, b0), pt(a, Rin, b0), pt(a, Rin, h), pt(a, Rr, h)], T.lift, { normal: [Math.cos(a) * (k ? 1 : -1), 0, Math.sin(a) * (k ? 1 : -1)], bias: 3 }); });
  add('chair', 1, shadow(759, 702, 170, 11, 0.75) + ch.svg(), [560, 420, 960, 722]);

  /* Baduk table: a round pebble table, a goban with real thickness, and two bowls of stones. The app draws the lines and stones. */
  const ct = new Solid(592, 712, 0, 1);
  ct.cyl(0, 0, 0, 120, 112, 8, T.pedestal);
  ct.cyl(0, 8, 0, 86, 62, 92, T.pedestal);
  ct.cyl(0, 100, 0, 196, 196, 14, T.table, { topLevel: 'lit' });
  const bq = manifest.baduk.quad.map(([u, v]) => world(u, v));
  const slab = 9, down = ([x, y]) => [x, y + slab];
  const cf = [shadow(592, 716, 130, 10, 0.7), ct.svg()];
  cf.push(poly([bq[3], bq[2], down(bq[2]), down(bq[3])], T.wood.mid), poly([bq[2], bq[1], down(bq[1]), down(bq[2])], T.wood.dark));
  cf.push(poly(bq, T.wood.lit));
  cf.push(poly([bil(bq, 0.025, 0.025), bil(bq, 0.975, 0.025), bil(bq, 0.975, 0.975), bil(bq, 0.025, 0.975)], mix(T.wood.lit, C.white, 0.06)));
  if (!PACK) {
    for (let k = 1; k <= 9; k++) { const t = k / 10; const a = bil(bq, 0.1, t), b = bil(bq, 0.9, t), c = bil(bq, t, 0.1), d = bil(bq, t, 0.9); cf.push(lineEl(a[0], a[1], b[0], b[1], C.ink, 0.5, 0.6), lineEl(c[0], c[1], d[0], d[1], C.ink, 0.5, 0.6)); }
    [[3, 3, 0], [5, 4, 1], [4, 6, 0], [6, 6, 1], [5, 5, 0], [7, 3, 1], [3, 7, 1]].forEach(([gx, gy, wh]) => cf.push(poly(circleIn(bq, gx / 10, gy / 10, 0.036, 0.036, 16), wh ? mix(C.white, C.cashmere, 0.15) : mix(C.ink, C.royal, 0.25))));
  }
  const bowl = (lx, lz, dark) => {
    const [px, py] = ct.at(lx, 114, lz), b = new Solid(px, py, 0, 1);
    b.cyl(0, 0, 0, 24, 28, 16, T.wood, { topLevel: 'lit' });
    const topY = py - 16 * CP;
    return b.svg() + `<path d="M${n(px - 24)} ${n(topY)}A24 13 0 0 1 ${n(px + 24)} ${n(topY)}Z" fill="${dark ? mix(C.ink, C.royal, 0.3) : mix(C.white, C.cashmere, 0.2)}"/>` +
      ell(px - 7, topY - 7, 8, 3.4, dark ? mix(C.royal, C.majestic, 0.35) : C.white, dark ? 0.8 : 0.7);
  };
  cf.push(bowl(-128, 34, true), bowl(150, 22, false));
  add('coffee', 1, cf.join(''), [380, 540, 800, 760]);

  /* foreground blades, cropped by the frame */
  const bl = [
    blade([20, 905], [96, 552], 40, 0.14), blade([66, 905], [150, 640], 34, 0.18), blade([118, 905], [236, 716], 28, 0.14),
    blade([1070, 905], [1124, 660], 34, 0.12), blade([1112, 905], [1178, 704], 30, 0.18), blade([1150, 905], [1236, 748], 26, 0.14),
  ].map((b) => ({ svg: pth(b.outline, T.leaf) + pth(b.halfR, mix(C.royal, C.majestic, 0.12)), ox: b.mid.match(/^M([\d.-]+) ([\d.-]+)/) }));
  add('fern_front', 1.15, bl.map((b) => sway(b.svg, Number(b.ox[1]), Number(b.ox[2]))).join(''), [0, 500, 1260, 905]);

  /* the ridge light: the second of exactly two lines */
  add('light', 1, `<g style="mix-blend-mode:screen"><g class="breath">
  <rect x="${xa}" y="${G.ridgeY}" width="${span}" height="130" fill="url(#glowDown)"/>
  <rect x="${xa}" y="${G.ridgeY - 30}" width="${span}" height="30" fill="url(#glowUp)"/></g></g>${core(G.ridgeY)}`, [xa, G.ridgeY - 30, xb, G.ridgeY + 130]);

  // weather lives in the app (GlassRain); the review preview draws its own so the page is not still
  if (!PACK) add('rain', 1, `<g clip-path="url(#rainClip)"><rect class="fall fa" x="${xa}" y="-150" width="${span}" height="${G.floorY + 150}" fill="url(#rainA)" fill-opacity=".14"/><rect class="fall fb" x="${xa}" y="-190" width="${span}" height="${G.floorY + 190}" fill="url(#rainB)" fill-opacity=".1"/></g><clipPath id="rainClip"><rect x="${xa}" y="${G.ridgeY}" width="${span}" height="${G.floorY - G.ridgeY}"/></clipPath>`, [xa, 0, xb, G.floorY]);
}

const CSS = `.breath{animation:breath 6s ease-in-out infinite}@keyframes breath{0%,100%{opacity:.82}50%{opacity:1}}` +
  `.sway{animation:sway 8s ease-in-out infinite}.sway.s2{animation-duration:9.5s;animation-delay:-2s}.sway.s3{animation-duration:7s;animation-delay:-4s}.sway.s4{animation-duration:10.5s;animation-delay:-1s}` +
  `@keyframes sway{0%,100%{transform:rotate(-1.1deg)}50%{transform:rotate(1.1deg)}}` +
  `.spin{animation:spin 1.8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}` +
  `.fall{animation:fall .9s linear infinite}.fall.fb{animation-name:fallb;animation-duration:1.3s}@keyframes fall{to{transform:translateY(150px)}}@keyframes fallb{to{transform:translateY(190px)}}` +
  `@media (prefers-reduced-motion:reduce){.breath,.sway,.spin,.fall{animation:none}}`;

const ORDER = ['sky', 'hills', 'floor', 'glass', 'ribs', 'floorlight', 'rug', 'screen', 'bonsai', 'camellia', 'credenza', 'tt_base', 'tt_platter', 'tt_arm', 'sleeve', 'tea', 'book', 'jar', 'desk', 'chair', 'coffee', 'fern_front', 'light', 'rain'];

const prefix = (svg, p) => svg
  .replace(/\bid="([^"]+)"/g, (_, i) => `id="${p}${i}"`)
  .replace(/url\(#([^)]+)\)/g, (_, i) => `url(#${p}${i})`)
  .replace(/href="#([^"]+)"/g, (_, i) => `href="#${p}${i}"`);

function previewSvg() {
  const d = defs();
  const body = ORDER.filter((id) => layers[id]).map((id) => `<g id="${id}" data-par="${layers[id].par}">${layers[id].svg}</g>`).join('\n');
  return prefix(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="The glass-house listening room at night, drawn as flat planes: a moon jar, a silk lounge chair, a record player, a six-panel folding screen, a Baduk table, and two lines of amber light.">
<title>The room in Planes</title>
<desc>Vector-Noir style frame B extended to the whole room. Posters and board lines are placeholders. Hex values are proposals.</desc>
<style>${CSS}</style>
${d.text}
${body}
</svg>
`, 'p-');
}

buildScene();
export { layers, ORDER, CSS, defs, G, W, H, manifest, prefix, xa, xb, previewSvg };

// run directly: write the preview
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('panorama.mjs')) {
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, INK_FLOOR ? 'panorama-b-planes-inkfloor.svg' : 'panorama-b-planes.svg');
  const svg = previewSvg();
  fs.writeFileSync(file, svg);
  console.log(file, (Buffer.byteLength(svg) / 1024).toFixed(1) + ' KB');
}
