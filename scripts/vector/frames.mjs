// Style frames for the Vector-Noir route: ONE scene, three line/fill treatments.
//   node scripts/vector/frames.mjs [outDir]
// The scene uses the same world as the 3D room (2026 x 844, aspect 2.4) and the same object
// positions as src/room/glasshouse.manifest.json, so a chosen treatment can become a scene pack.
// Layer groups are named after manifest ids so each can later become its own parallax layer.
import fs from 'node:fs';
import path from 'node:path';
import { C, mix, n } from './tokens.mjs';
import { P, smooth, jarGeometry, blade } from './geom.mjs';

const out = process.argv[2] || 'docs/style-frames';
const X0 = 1082, VW = 390, VH = 844;           // the crop shown on a phone, in world units

const G = {
  ridgeY: 34, floorY: 500, transomY: 330, upstandH: 18,
  mullions: [815, 965, 1115, 1265, 1415, 1565, 1715],
  arc: { cx: 1000, cy: 500, radii: [470, 560] },
  moon: { x: 1190, y: 215, r: 24 },
  jar: { cx: 1277.5, base: 633, rb: 84.5 },
  credenza: { x0: 760, x1: 1150, top: 470, bottom: 596, leg: 612 },
  span: [X0 - 80, X0 + VW + 80],
};

/* ---------- the three treatments ---------- */
const STYLES = {
  a: {
    id: 'a', name: 'Hairline',
    w: { s: 1.3, o: 0.9, d: 0.5 },
    note: 'Line only. Constant hairlines on ink; fills appear only as light.',
  },
  b: {
    id: 'b', name: 'Planes',
    w: { s: 0, o: 0, d: 0 },
    note: 'No outlines. Flat planes of indigo and violet; light does the drawing.',
  },
  c: {
    id: 'c', name: 'Line and light',
    w: { s: 2.4, o: 1.2, d: 0.6 },
    note: 'Three line tiers over smooth gradients; the rim light fades along the line.',
  },
};

function scene(st) {
  const A = st.id === 'a', B = st.id === 'b', Cc = st.id === 'c';
  const w = st.w;
  const [xa, xb] = G.span;
  const jar = jarGeometry({ cx: G.jar.cx, base: G.jar.base, rb: G.jar.rb });
  const ink = C.ink, royal = C.royal;
  const line = (x1, y1, x2, y2, col, sw, op = 1) => `<path d="M${P(x1, y1)}L${P(x2, y2)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-opacity="${op}" stroke-linecap="round"/>`;
  const stroke = (d, col, sw, op = 1, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const parts = [];

  /* defs */
  const cashSky = [mix(ink, royal, 0.1), mix(ink, royal, 0.95), mix(royal, C.majestic, 0.6)];
  parts.push(`<defs>
  <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cashSky[0]}"/><stop offset=".5" stop-color="${cashSky[1]}"/><stop offset="1" stop-color="${cashSky[2]}"/></linearGradient>
  <radialGradient id="moonHalo"><stop offset="0" stop-color="${C.white}" stop-opacity=".30"/><stop offset=".35" stop-color="${C.white}" stop-opacity=".10"/><stop offset="1" stop-color="${C.white}" stop-opacity="0"/></radialGradient>
  <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.majestic}" stop-opacity="0"/><stop offset="1" stop-color="${mix(C.majestic, C.white, 0.15)}" stop-opacity=".30"/></linearGradient>
  <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(ink, royal, 0.55)}"/><stop offset=".45" stop-color="${ink}"/><stop offset="1" stop-color="#05071a"/></linearGradient>
  <linearGradient id="glowDown" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.amber}" stop-opacity=".5"/><stop offset=".07" stop-color="${C.amber}" stop-opacity=".22"/><stop offset=".22" stop-color="${C.amber}" stop-opacity=".07"/><stop offset=".55" stop-color="${C.amber}" stop-opacity=".015"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></linearGradient>
  <linearGradient id="glowUp" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.amber}" stop-opacity=".26"/><stop offset=".25" stop-color="${C.amber}" stop-opacity=".07"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.white}" stop-opacity=".07"/><stop offset="1" stop-color="${C.white}" stop-opacity="0"/></linearGradient>
  <radialGradient id="jarFill" cx=".34" cy=".3" r=".85"><stop offset="0" stop-color="#F7F3EA"/><stop offset=".5" stop-color="${C.white}"/><stop offset=".8" stop-color="${mix(C.white, C.violet, 0.5)}"/><stop offset="1" stop-color="${mix(C.violet, C.silk, 0.6)}"/></radialGradient>
  <linearGradient id="jarRim" gradientUnits="userSpaceOnUse" x1="${n(jar.left)}" y1="${n(jar.top)}" x2="${n(jar.right)}" y2="${G.jar.base}"><stop offset="0" stop-color="${C.white}" stop-opacity=".95"/><stop offset=".5" stop-color="${C.white}" stop-opacity=".35"/><stop offset="1" stop-color="${C.violet}" stop-opacity=".25"/></linearGradient>
  <linearGradient id="silk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(C.silk, C.violet, 0.12)}"/><stop offset="1" stop-color="${mix(C.silk, ink, 0.55)}"/></linearGradient>
  <linearGradient id="refl" gradientUnits="userSpaceOnUse" x1="0" y1="${G.jar.base}" x2="0" y2="${G.jar.base + 120}"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="reflMask" maskUnits="userSpaceOnUse" x="${xa}" y="${G.jar.base}" width="${xb - xa}" height="140"><rect x="${xa}" y="${G.jar.base}" width="${xb - xa}" height="140" fill="url(#refl)"/></mask>
  <clipPath id="jarClip"><path d="${jar.body}"/></clipPath>
  <path id="jarBody" d="${jar.body}"/>
</defs>`);

  /* sky: the deep background, one smooth gradient, with the moon */
  parts.push(`<g id="sky">
  <rect x="${xa}" y="0" width="${xb - xa}" height="${G.floorY}" fill="url(#skyG)"/>
  <rect x="${xa}" y="${G.floorY - 120}" width="${xb - xa}" height="120" fill="url(#haze)"/>
  <circle cx="${G.moon.x}" cy="${G.moon.y}" r="130" fill="url(#moonHalo)"/>
  ${A ? `<circle cx="${G.moon.x}" cy="${G.moon.y}" r="${G.moon.r}" fill="none" stroke="${C.white}" stroke-width="${w.o}" stroke-opacity=".9"/>`
      : `<circle cx="${G.moon.x}" cy="${G.moon.y}" r="${G.moon.r}" fill="${C.white}"/>`}
</g>`);

  /* far hills: ONE continuous line, no buildings */
  const hillsFar = [[xa - 40, 424], [1020, 414], [1100, 402], [1170, 415], [1245, 398], [1325, 413], [1400, 404], [1470, 418], [xb + 40, 410]];
  const hillsNear = [[xa - 40, 480], [1040, 474], [1130, 484], [1210, 472], [1300, 483], [1390, 476], [1480, 485], [xb + 40, 478]];
  const closeHill = (pts, fill, fo = 1) => `<path d="${smooth(pts)}L${P(xb + 40, G.floorY)}L${P(xa - 40, G.floorY)}Z" fill="${fill}" fill-opacity="${fo}"/>`;
  parts.push(`<g id="hills">
  ${A ? '' : closeHill(hillsFar, mix(royal, ink, 0.5))}
  ${A ? stroke(smooth(hillsFar), C.majestic, w.d + 0.1, 0.7) : Cc ? stroke(smooth(hillsFar), C.majestic, w.d, 0.55) : ''}
  ${A ? '' : closeHill(hillsNear, mix(ink, royal, 0.2))}
  ${A ? stroke(smooth(hillsNear), C.majestic, w.d, 0.4) : ''}
</g>`);

  /* glass wall: mullions, one transom, a stone upstand, and a little sheen */
  const mx = G.mullions.filter((x) => x > xa && x < xb);
  const wall = [];
  if (A) {
    for (const x of mx) { wall.push(line(x - 2.2, G.ridgeY, x - 2.2, G.floorY, C.white, w.d, 0.45), line(x + 2.2, G.ridgeY, x + 2.2, G.floorY, C.white, w.d, 0.45)); }
    wall.push(line(xa, G.transomY - 2, xb, G.transomY - 2, C.white, w.d, 0.45), line(xa, G.transomY + 2, xb, G.transomY + 2, C.white, w.d, 0.45));
    wall.push(line(xa, G.floorY + G.upstandH, xb, G.floorY + G.upstandH, C.white, w.d, 0.3));
  } else {
    const col = B ? mix(ink, royal, 0.35) : '#070A1E';
    for (const x of mx) wall.push(line(x, G.ridgeY, x, G.floorY, col, B ? 5 : 3.4));
    wall.push(line(xa, G.transomY, xb, G.transomY, col, B ? 4 : 2.6));
    wall.push(`<rect x="${xa}" y="${G.floorY}" width="${xb - xa}" height="${G.upstandH}" fill="${B ? mix(ink, royal, 0.3) : mix(ink, royal, 0.22)}"/>`);
    if (Cc) {
      for (const x of mx) wall.push(line(x + 2.1, G.ridgeY, x + 2.1, G.floorY, mix(C.majestic, C.white, 0.2), w.d, 0.4));
      wall.push(line(xa, G.transomY - 1.6, xb, G.transomY - 1.6, mix(C.majestic, C.white, 0.2), w.d, 0.35));
      wall.push(line(xa, G.floorY + 0.4, xb, G.floorY + 0.4, mix(C.majestic, C.white, 0.3), w.d, 0.5));
    }
    for (const x of [1135, 1318]) wall.push(`<polygon points="${P(x, G.ridgeY)} ${P(x + 54, G.ridgeY)} ${P(x - 118, G.floorY)} ${P(x - 172, G.floorY)}" fill="url(#sheen)"/>`);
  }
  parts.push(`<g id="glass">${wall.join('')}</g>`);

  /* ribs: two nested arcs, the vault coming towards you */
  const ribs = G.arc.radii.map((r, i) => {
    const d = `M${P(G.arc.cx - r, G.arc.cy)}A${r} ${r} 0 0 1 ${P(G.arc.cx + r, G.arc.cy)}`;
    if (A) return stroke(d, C.white, i === 0 ? w.s : w.o, i === 0 ? 0.8 : 0.5);
    if (B) return stroke(d, mix(ink, royal, 0.28), i === 0 ? 9 : 6) +
      stroke(`M${P(G.arc.cx - r - (i === 0 ? 3.6 : 2.4), G.arc.cy)}A${r + (i === 0 ? 3.6 : 2.4)} ${r + (i === 0 ? 3.6 : 2.4)} 0 0 1 ${P(G.arc.cx + r + (i === 0 ? 3.6 : 2.4), G.arc.cy)}`, mix(C.majestic, C.white, 0.15), 1.6, 0.55);
    return stroke(d, '#070A1E', i === 0 ? 4.4 : 3) + stroke(`M${P(G.arc.cx - r + 1.8, G.arc.cy)}A${r - 1.8} ${r - 1.8} 0 0 1 ${P(G.arc.cx + r - 1.8, G.arc.cy)}`, mix(C.majestic, C.white, 0.3), w.d, i === 0 ? 0.55 : 0.35);
  });
  parts.push(`<g id="ribs">${ribs.join('')}</g>`);

  /* the floor, a quiet reflection, and the credenza behind the jar */
  const floor = [`<rect x="${xa}" y="${G.floorY}" width="${xb - xa}" height="${VH - G.floorY}" fill="${A ? ink : 'url(#floorG)'}"/>`];
  if (A) {
    for (const y of [G.floorY + G.upstandH, 548, 592, 654, 744]) floor.push(line(xa, y, xb, y, C.white, w.d, 0.16));
  }
  parts.push(`<g id="floor">${floor.join('')}</g>`);

  const cz = G.credenza;
  const czParts = [];
  if (A) {
    czParts.push(`<rect x="${cz.x0}" y="${cz.top}" width="${cz.x1 - cz.x0}" height="${cz.bottom - cz.top}" rx="5" fill="${ink}" stroke="${C.white}" stroke-width="${w.o}" stroke-opacity=".7"/>`);
    for (let x = cz.x1 - 12; x > xa; x -= 9) czParts.push(line(x, cz.top + 10, x, cz.bottom - 10, C.white, w.d, 0.22));
    czParts.push(line(cz.x1 - 36, cz.bottom, cz.x1 - 36, cz.leg, C.white, w.o, 0.6), line(cz.x1 - 31, cz.bottom, cz.x1 - 31, cz.leg, C.white, w.o, 0.6));
  } else {
    czParts.push(`<rect x="${cz.x1 - 34}" y="${cz.bottom - 2}" width="5" height="${cz.leg - cz.bottom + 2}" fill="${mix(ink, C.silk, 0.3)}"/>`);
    czParts.push(`<rect x="${cz.x0}" y="${cz.top}" width="${cz.x1 - cz.x0}" height="${cz.bottom - cz.top}" rx="5" fill="${B ? C.silk : 'url(#silk)'}"/>`);
    if (B) czParts.push(`<rect x="${cz.x0}" y="${cz.top}" width="${cz.x1 - cz.x0}" height="9" rx="4" fill="${mix(C.silk, C.violet, 0.45)}"/>`);
    if (Cc) czParts.push(line(cz.x0 + 5, cz.top + 0.6, cz.x1 - 5, cz.top + 0.6, C.violet, w.o, 0.75), line(cz.x0 + 5, cz.bottom - 0.4, cz.x1 - 5, cz.bottom - 0.4, ink, w.o, 0.6));
  }
  parts.push(`<g id="credenza">${czParts.join('')}</g>`);

  /* the moon jar: the one focal object */
  const jp = [];
  const shadowEl = `<ellipse cx="${G.jar.cx + 4}" cy="${G.jar.base + 3}" rx="74" ry="7" fill="${ink}" fill-opacity="${A ? 0 : 0.75}"/>`;
  jp.push(shadowEl);
  const refl = `<g mask="url(#reflMask)" transform="translate(0 ${2 * G.jar.base}) scale(1 -1)">`;
  if (A) jp.push(`${refl}<use href="#jarBody" fill="none" stroke="${C.white}" stroke-width="${w.d}" stroke-opacity=".5"/></g>`);
  else jp.push(`${refl}<use href="#jarBody" fill="${B ? C.white : 'url(#jarFill)'}" fill-opacity="${B ? 0.16 : 0.22}"/></g>`);
  if (A) {
    jp.push(`<use href="#jarBody" fill="${mix(ink, royal, 0.35)}" stroke="${C.white}" stroke-width="${w.s}" stroke-linejoin="round"/>`);
    jp.push(`<ellipse cx="${n(jar.rim.cx)}" cy="${n(jar.rim.cy)}" rx="${n(jar.rim.rx)}" ry="${jar.rim.ry}" fill="${ink}" stroke="${C.white}" stroke-width="${w.o}"/>`);
    jp.push(stroke(jar.seam, C.white, w.d, 0.55));
  } else if (B) {
    const cx = G.jar.cx, b = G.jar.base;
    jp.push(`<use href="#jarBody" fill="${mix(C.violet, C.silk, 0.2)}"/>`);
    jp.push(`<circle clip-path="url(#jarClip)" cx="${n(cx - 42)}" cy="${n(b - 118)}" r="104" fill="${C.white}"/>`);
    jp.push(`<ellipse cx="${n(jar.rim.cx)}" cy="${n(jar.rim.cy)}" rx="${n(jar.rim.rx - 1)}" ry="${jar.rim.ry - 0.5}" fill="${mix(C.violet, C.silk, 0.55)}"/>`);
    jp.push(stroke(jar.seam, C.violet, 1, 0.5));
  } else {
    jp.push(`<use href="#jarBody" fill="url(#jarFill)"/>`);
    jp.push(`<ellipse cx="${n(jar.rim.cx)}" cy="${n(jar.rim.cy)}" rx="${n(jar.rim.rx - 0.8)}" ry="${jar.rim.ry - 0.4}" fill="${mix(C.violet, ink, 0.55)}"/>`);
    jp.push(stroke(jar.seam, C.violet, w.d, 0.55));
    jp.push(`<use href="#jarBody" fill="none" stroke="url(#jarRim)" stroke-width="${w.o}" stroke-linejoin="round"/>`);
    jp.push(`<ellipse cx="${n(jar.rim.cx)}" cy="${n(jar.rim.cy)}" rx="${n(jar.rim.rx)}" ry="${jar.rim.ry}" fill="none" stroke="${C.white}" stroke-width="${w.d}" stroke-opacity=".8"/>`);
  }
  parts.push(`<g id="jar">${jp.join('')}</g>`);

  /* foreground leaves: long blades, cropped by the frame */
  const blades = [
    blade([1058, 905], [1128, 515], 38, 0.1),
    blade([1100, 905], [1172, 600], 33, 0.2),
    blade([1140, 905], [1240, 702], 28, 0.16),
    blade([1160, 905], [1318, 762], 23, 0.1),
  ];
  const leafFill = mix(ink, royal, 0.58);
  const lf = [];
  for (const b of blades) {
    if (A) lf.push(`<path d="${b.outline}" fill="${ink}" stroke="${C.majestic}" stroke-width="${w.o}" stroke-opacity=".9"/>`, stroke(b.mid, C.majestic, w.d, 0.55));
    else if (B) lf.push(`<path d="${b.outline}" fill="${leafFill}"/>`, `<path d="${b.halfR}" fill="${mix(royal, C.majestic, 0.12)}"/>`);
    else lf.push(`<path d="${b.outline}" fill="${leafFill}"/>`, stroke(b.left, mix(C.majestic, C.white, 0.2), w.o, 0.75), stroke(b.mid, C.majestic, w.d, 0.4));
  }
  parts.push(`<g id="fern_front">${lf.join('')}</g>`);

  /* Two Lines: exactly two concealed light lines. The floor-edge line runs behind the furniture. */
  const span = xb - xa;
  const coreLine = (y) => line(xa, y, xb, y, C.amber, A ? 1.2 : 1.7) + line(xa, y, xb, y, mix(C.amber, C.white, 0.6), 0.55, 0.9);
  parts.push(`<g id="floorlight"><g style="mix-blend-mode:screen"><g class="breath">
    <rect x="${xa}" y="${G.floorY}" width="${span}" height="110" fill="url(#glowDown)"/>
    <rect x="${xa}" y="${G.floorY - 30}" width="${span}" height="30" fill="url(#glowUp)"/>
  </g></g>${coreLine(G.floorY)}</g>`);
  parts.push(`<g id="light"><g style="mix-blend-mode:screen"><g class="breath">
    <rect x="${xa}" y="${G.ridgeY}" width="${span}" height="130" fill="url(#glowDown)"/>
    <rect x="${xa}" y="${G.ridgeY - 30}" width="${span}" height="30" fill="url(#glowUp)"/>
  </g></g>${coreLine(G.ridgeY)}</g>`);

  // stacking order, back to front
  const order = ['defs', 'sky', 'hills', 'floor', 'glass', 'ribs', 'floorlight', 'credenza', 'jar', 'fern_front', 'light'];
  const rank = (str) => { const m = str.match(/^<(?:g|defs) id="([^"]+)"/); return order.indexOf(m ? m[1] : 'defs'); };
  parts.sort((x, y) => rank(x) - rank(y));
  return parts.join('\n');
}

function svgFor(st) {
  return prefixIds(`<svg xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${VH}" viewBox="${X0} 0 ${VW} ${VH}" role="img" aria-label="Style frame ${st.id.toUpperCase()}: ${st.name}. A glass-house wall at night with a moon jar and two lines of amber light.">
<title>Style frame ${st.id.toUpperCase()}: ${st.name}</title>
<desc>${st.note} Hex values are proposals; light lines are Linear Amber.</desc>
<style>.breath{animation:breath 6s ease-in-out infinite}@keyframes breath{0%,100%{opacity:.82}50%{opacity:1}}@media (prefers-reduced-motion:reduce){.breath{animation:none}}</style>
${scene(st)}
</svg>
`, st.id + '-');
}

// ids and references get a per-frame prefix, so gradients from different frames never collide
function prefixIds(svg, p) {
  return svg
    .replace(/\bid="([^"]+)"/g, (_, i) => `id="${p}${i}"`)
    .replace(/url\(#([^)]+)\)/g, (_, i) => `url(#${p}${i})`)
    .replace(/href="#([^"]+)"/g, (_, i) => `href="#${p}${i}"`);
}

fs.mkdirSync(out, { recursive: true });
const names = { a: 'frame-a-hairline', b: 'frame-b-planes', c: 'frame-c-line-and-light' };
for (const st of Object.values(STYLES)) {
  const file = path.join(out, `${names[st.id]}.svg`);
  fs.writeFileSync(file, svgFor(st));
  console.log(file, (fs.statSync(file).size / 1024).toFixed(1) + ' KB');
}
export { STYLES, G, X0, VW, VH };
