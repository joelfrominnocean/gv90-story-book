// Shared geometry helpers for the Vector-Noir scene pack (frames.mjs, panorama.mjs).
import { n } from './tokens.mjs';

export const P = (x, y) => `${n(x)} ${n(y)}`;

// Catmull-Rom through points -> cubic Bezier path
export function smooth(pts, move = true) {
  let d = move ? `M${P(...pts[0])}` : '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    d += `C${P(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)} ${P(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)} ${P(...p2)}`;
  }
  return d;
}

// Moon jar: two hemispherical halves joined at the belly. The left half is 3% narrower and sits
// 2 units higher, so the belly seam tilts about 1.4 degrees. Lines are exact; the form is not.
export function jarGeometry({ cx, base, rb }) {
  const half = (sign, rbx, by, foot, nu, rimR) => {
    const neck = Math.sqrt(rbx * rbx - (nu - by) ** 2);          // neck radius where a hemisphere would meet it
    const dxe = neck + 9;                                         // the shoulder stops short and eases into the neck
    const ye = by + Math.sqrt(rbx * rbx - dxe * dxe);
    const ft = rbx * Math.sqrt(1 - ((by - 9) / by) ** 2);         // foot-top radius on the lower ellipse
    return { s: sign, rbx, by, foot, nu, rimR, neck, dxe, ye, ft };
  };
  const R = half(1, rb, 88, 29, 165, 39);
  const L = half(-1, rb * 0.97, 90, 29.5, 165.5, 38.6);
  const X = (h, d) => cx + h.s * d, Y = (u) => base - u;
  const body =
    `M${P(X(L, L.foot), base)}L${P(X(R, R.foot), base)}L${P(X(R, R.foot + 1.5), Y(3.5))}L${P(X(R, R.ft), Y(9))}` +
    `A${n(R.rbx)} ${n(R.by)} 0 0 0 ${P(X(R, R.rbx), Y(R.by))}` +
    `A${n(R.rbx)} ${n(R.rbx)} 0 0 0 ${P(X(R, R.dxe), Y(R.ye))}` +
    `Q${P(X(R, R.neck + 1.5), Y(R.ye + 7))} ${P(X(R, R.neck), Y(R.ye + 14))}` +
    `L${P(X(R, R.neck), Y(176))}L${P(X(R, R.rimR), Y(182))}` +
    `A${n(R.rimR)} 5 0 0 0 ${P(X(L, L.rimR), Y(182.4))}` +
    `L${P(X(L, L.neck), Y(176))}L${P(X(L, L.neck), Y(L.ye + 14))}` +
    `Q${P(X(L, L.neck + 1.5), Y(L.ye + 7))} ${P(X(L, L.dxe), Y(L.ye))}` +
    `A${n(L.rbx)} ${n(L.rbx)} 0 0 0 ${P(X(L, L.rbx), Y(L.by))}` +
    `A${n(L.rbx)} ${n(L.by)} 0 0 0 ${P(X(L, L.ft), Y(9))}L${P(X(L, L.foot + 1.5), Y(3.5))}Z`;
  // the seam: the equator seen from slightly above, so it sags toward the viewer
  const seam = `M${P(X(L, L.rbx), Y(L.by))}Q${P(cx, Y(R.by - 14))} ${P(X(R, R.rbx), Y(R.by))}`;
  const rim = { cx: cx - 0.2, cy: Y(182.2), rx: (R.rimR + L.rimR) / 2, ry: 5 };
  return { body, seam, rim, top: Y(187), left: X(L, L.rbx), right: X(R, R.rbx) };
}

// Long narrow leaf blade (strelitzia-like). Returns outline path + two edge polylines + midrib.
export function blade(b, t, w, bend) {
  const dx = t[0] - b[0], dy = t[1] - b[1], len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const q = [(b[0] + t[0]) / 2 + nx * bend * len, (b[1] + t[1]) / 2 + ny * bend * len];
  const at = (u) => [(1 - u) ** 2 * b[0] + 2 * (1 - u) * u * q[0] + u * u * t[0], (1 - u) ** 2 * b[1] + 2 * (1 - u) * u * q[1] + u * u * t[1]];
  const tan = (u) => { const ax = 2 * (1 - u) * (q[0] - b[0]) + 2 * u * (t[0] - q[0]), ay = 2 * (1 - u) * (q[1] - b[1]) + 2 * u * (t[1] - q[1]); const l = Math.hypot(ax, ay); return [-ay / l, ax / l]; };
  const left = [], right = [], mid = [];
  for (let i = 0; i <= 22; i++) {
    const u = i / 22, c = at(u), nrm = tan(u), hw = (w / 2) * Math.sin(Math.PI * Math.pow(u, 0.72)) * (1 - 0.25 * u);
    left.push([c[0] + nrm[0] * hw, c[1] + nrm[1] * hw]); right.push([c[0] - nrm[0] * hw, c[1] - nrm[1] * hw]); mid.push(c);
  }
  const outline = smooth(left) + 'L' + P(...right[right.length - 1]) + smooth([...right].reverse(), false) + 'Z';
  const halfR = smooth(right) + smooth([...mid].reverse(), false) + 'Z';   // the far half of the blade, for flat shading
  return { outline, halfR, left: smooth(left), right: smooth(right), mid: smooth(mid) };
}

