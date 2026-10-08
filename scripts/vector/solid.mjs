// A tiny flat-shaded solid renderer for the Vector-Noir scene pack.
// Objects are built from boxes, cylinders and strips in local units, turned by a yaw, seen from a fixed low pitch, and painted as
// flat polygons in three tones (lit / mid / dark) chosen by which way each face points. No outlines: the planes ARE the drawing.
// Orthographic projection, y up, z toward the viewer; every object in the room shares one camera pitch so they sit together.
import { n } from './tokens.mjs';
import { P } from './geom.mjs';

export const PITCH = (13 * Math.PI) / 180;
const SP = Math.sin(PITCH), CP = Math.cos(PITCH);
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = norm([-0.45, 0.8, 0.4]);      // soft key from upper left, a little toward the viewer
const VIEW = [0, SP, CP];                    // from the scene toward the camera

export const tri = (lit, mid, dark) => ({ lit, mid, dark });

export class Solid {
  /** ox, oy: where the local origin (centre of the base) lands on the frame; yaw in degrees; scale multiplies every size. */
  constructor(ox, oy, yaw = 0, scale = 1) {
    this.ox = ox; this.oy = oy; this.t = (yaw * Math.PI) / 180; this.s = scale; this.faces = [];
  }
  rot(v) { const c = Math.cos(this.t), s = Math.sin(this.t); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  proj(v) { const r = this.rot(v); return [this.ox + r[0] * this.s, this.oy - r[1] * CP * this.s + r[2] * SP * this.s, r[2] * this.s]; }
  /** One flat polygon. Vertices run counter-clockwise seen from outside; faces turned away from the camera are dropped. */
  face(verts, tones, opts = {}) {
    const nl = opts.normal ? norm(opts.normal) : norm(cross(sub(verts[1], verts[0]), sub(verts[2], verts[0])));
    const nw = this.rot(nl);
    if (!opts.both && dot(nw, VIEW) <= 0.001) return;
    const d = dot(nw, LIGHT);
    const level = opts.level || (d > 0.6 ? 'lit' : d > 0.1 ? 'mid' : 'dark');
    const pts = verts.map((v) => this.proj(v));
    this.faces.push({ pts, fill: tones[level], depth: pts.reduce((a, p) => a + p[2], 0) / pts.length + (opts.bias || 0) });
  }
  /** A box: x from cx - w/2, y from y0 up by h, z from cz - d/2 (z toward the viewer). */
  box(cx, y0, cz, w, h, d, tones, opts = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y1 = y0 + h, z0 = cz - d / 2, z1 = cz + d / 2;
    this.face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], tones, opts);   // top
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], tones, opts);   // front
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], tones, opts);   // back
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], tones, opts);   // right
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], tones, opts);   // left
  }
  /** A cylinder or cone (r0 at the bottom, r1 at the top), faceted so the three tones read as bands of light. */
  cyl(cx, y0, cz, r0, r1, h, tones, opts = {}) {
    const seg = opts.seg || 40, slope = (r0 - r1) / h;
    const at = (a, r, y) => [cx + r * Math.sin(a), y, cz + r * Math.cos(a)];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      this.face([at(a0, r0, y0), at(a1, r0, y0), at(a1, r1, y0 + h), at(a0, r1, y0 + h)], opts.sideTones || tones, { ...opts, normal: [Math.sin(am), slope, Math.cos(am)] });
    }
    if (r1 > 0) this.face(Array.from({ length: seg }, (_, i) => at(-(i / seg) * Math.PI * 2, r1, y0 + h)), tones, { ...opts, normal: [0, 1, 0], level: opts.topLevel });
  }
  svg() {
    return [...this.faces].sort((a, b) => a.depth - b.depth).map((f) => {
      const pts = f.pts.map((p) => P(p[0], p[1])).join(' ');
      return `<polygon points="${pts}" fill="${f.fill}" stroke="${f.fill}" stroke-width=".5" stroke-linejoin="round"/>`;
    }).join('');
  }
  /** The frame rectangle the drawn faces cover, grown by a margin. */
  bbox(pad = 0) {
    const xs = this.faces.flatMap((f) => f.pts.map((p) => p[0])), ys = this.faces.flatMap((f) => f.pts.map((p) => p[1]));
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  }
  /** Where a local point lands on the frame (for shadows, labels and alignment). */
  at(x, y, z) { const p = this.proj([x, y, z]); return [p[0], p[1]]; }
}
