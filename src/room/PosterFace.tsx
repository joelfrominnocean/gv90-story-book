import type { ShelfBookSpec } from "../book3d/shelf";
import { mix } from "./palette";

const INK = "#120d09";
export const POSTER_W = 140;
export const POSTER_H = 240;

const wrap = (title: string, max = 12): string[] => {
  const out: string[] = [];
  let line = "";
  for (const w of title.split(" ")) {
    if ((line + " " + w).trim().length > max && line) {
      out.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out.slice(0, 3);
};

/**
 * What is in one panel of the folding screen, drawn from data: a poster for a chapter that has arrived, or a dark empty frame with a
 * brass plate showing the date for one that has not. It is laid flat in its own 140 x 200 box; the page warps that box onto the
 * panel's four corners. (The poster art is a scamp, to be replaced.)
 */
export function PosterFace({ n, spec }: { n: number; spec: ShelfBookSpec }) {
  const open = !spec.locked;
  const paper = mix(spec.accent, "#efe6d2", 0.8);
  const cx = POSTER_W / 2;
  const lines = wrap(spec.title);
  return (
    <svg viewBox={`0 0 ${POSTER_W} ${POSTER_H}`} width={POSTER_W} height={POSTER_H} aria-hidden="true" style={{ display: "block" }}>
      {open ? (
        <g>
          <rect width={POSTER_W} height={POSTER_H} fill={paper} />
          <rect x="6" y="6" width={POSTER_W - 12} height={POSTER_H - 12} fill="none" stroke={INK} strokeWidth="1.6" />
          <g transform="translate(0 26)">
          {n === 0 && (
            <g>
              <circle cx={cx} cy="82" r="36" fill={INK} />
              <path d={`M${cx - 4} 48 A 36 36 0 0 1 ${cx + 32} 90 A 30 30 0 0 0 ${cx - 4} 48 Z`} fill="#f2c36b" />
            </g>
          )}
          {n === 1 && (
            <g>
              <circle cx={cx} cy="80" r="40" fill="#f6f0df" stroke={INK} strokeWidth="2.5" />
              <path d="M20 134 q 14 -10 28 0 t 28 0 t 28 0 t 28 0" fill="none" stroke={INK} strokeWidth="2.5" />
            </g>
          )}
          {n === 2 && (
            <g>
              <path d={`M${cx - 32} 132 V 70 A 32 32 0 0 1 ${cx + 32} 70 V 132 Z`} fill={INK} />
              <path d={`M${cx - 19} 132 V 76 A 19 19 0 0 1 ${cx + 19} 76 V 132 Z`} fill="#f2c36b" />
            </g>
          )}
          {n === 3 && (
            <g fill="none" stroke={INK} strokeWidth="2.5">
              <circle cx={cx} cy="84" r="12" fill={INK} />
              <circle cx={cx} cy="84" r="30" />
              <circle cx={cx} cy="84" r="46" />
            </g>
          )}
          {n === 4 && (
            <g stroke={INK} strokeWidth="2">
              <rect x="22" y="40" width="30" height="92" fill="#c28a3a" />
              <rect x="56" y="40" width="30" height="92" fill="#27385c" />
              <rect x="90" y="40" width="30" height="92" fill="#e0d3b3" />
            </g>
          )}
          {n === 5 && (
            <g>
              <path d="M14 126 A 56 56 0 0 1 126 126 Z" fill="#f2c36b" stroke={INK} strokeWidth="2.5" />
              <line x1="8" y1="126" x2="132" y2="126" stroke={INK} strokeWidth="3" />
            </g>
          )}
          {lines.map((t, i) => (
            <text key={i} x={cx} y={POSTER_H - 70 + i * 17} textAnchor="middle" fontFamily="var(--serif)" fontSize="16" fontWeight="500" fill={INK}>
              {t}
            </text>
          ))}
          </g>
        </g>
      ) : (
        <g>
          <rect width={POSTER_W} height={POSTER_H} fill="#171b1f" />
          <rect x="3" y="3" width={POSTER_W - 6} height={POSTER_H - 6} fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="6" />
          <rect x={cx - 34} y={POSTER_H - 52} width="68" height="28" fill="#b38f4a" stroke={INK} strokeWidth="2.5" />
          <text x={cx} y={POSTER_H - 33} textAnchor="middle" fontFamily="var(--sans)" fontSize="14" letterSpacing="1.4" fontWeight="600" fill="#2a2010">
            {spec.band ? `${spec.band[0]} ${spec.band[1].toUpperCase()}` : "TBC"}
          </text>
        </g>
      )}
    </svg>
  );
}

/** CSS matrix3d that maps a w x h box onto a quadrilateral (corners in order: top-left, top-right, bottom-right, bottom-left, in px). */
export function quadMatrix(w: number, h: number, q: [number, number][]): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q as [[number, number], [number, number], [number, number], [number, number]];
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let a: number, b: number, d: number, e: number, g: number, hh: number;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0;
    b = x3 - x0;
    d = y1 - y0;
    e = y3 - y0;
    g = 0;
    hh = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    hh = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1;
    b = x3 - x0 + hh * x3;
    d = y1 - y0 + g * y1;
    e = y3 - y0 + hh * y3;
  }
  const f = (n: number) => n.toFixed(6);
  return `matrix3d(${f(a / w)},${f(d / w)},0,${f(g / w)},${f(b / h)},${f(e / h)},0,${f(hh / h)},0,0,1,0,${f(x0)},${f(y0)},0,1)`;
}
