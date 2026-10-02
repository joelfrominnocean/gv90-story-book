import { useMemo } from "react";
import type { ShelfBookSpec } from "../book3d/shelf";
import { mix } from "./palette";

/**
 * The listening room, drawn as flat-colour SVG with ink outlines. This is a scamp: the composition, the object list and the
 * behaviour are the point. The art itself is to be replaced by an illustrator's frame (ink linework, flat fills, watercolour
 * washes on the glass and sky), so everything here is positioned in one coordinate system (SCENE_W x SCENE_H) and the
 * interactive parts are laid over it by rectangle.
 */
export const SCENE_W = 2000;
export const SCENE_H = 1080;
export const WIN = { x: 690, y: 110, w: 620, h: 590 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const POSTER_COLS = [1480, 1650, 1820];
const POSTER_ROWS = [140, 380];
export const POSTER_W = 140;
export const POSTER_H = 190;
export const posterRect = (n: number): Rect => ({ x: POSTER_COLS[n % 3]!, y: POSTER_ROWS[Math.floor(n / 3)]!, w: POSTER_W, h: POSTER_H });

/** The turntable overlay's own viewBox (scene units): the platter, the arm and the sleeve that stands beside it. */
export const TURNTABLE_BOX: Rect = { x: 760, y: 600, w: 440, h: 150 };
export const HOT = {
  turntable: { x: 764, y: 640, w: 312, h: 108 } as Rect,
  sleeve: { x: 1084, y: 628, w: 100, h: 118 } as Rect,
  jar: { x: 1204, y: 590, w: 136, h: 154 } as Rect,
  /** The open book on the credenza: the folk tale. */
  tale: { x: 1478, y: 696, w: 184, h: 54 } as Rect,
};
export const LAMP = { x: 670, y: 660 };

/** A rectangle in scene units as CSS percentages of the scene, so overlays stay put at any size. */
export const pct = (r: Rect, grow = 0): { left: string; top: string; width: string; height: string } => ({
  left: `${((r.x - r.w * grow) / SCENE_W) * 100}%`,
  top: `${((r.y - r.h * grow) / SCENE_H) * 100}%`,
  width: `${(r.w * (1 + 2 * grow) / SCENE_W) * 100}%`,
  height: `${(r.h * (1 + 2 * grow) / SCENE_H) * 100}%`,
});

const INK = "#120d09";
const SLEEVES = ["#c28a3a", "#3f6f73", "#8a3b34", "#e0d3b3", "#6f8566", "#27385c", "#b4572f", "#d1a63f"];
export const sleeveColour = (i: number): string => SLEEVES[((i % SLEEVES.length) + SLEEVES.length) % SLEEVES.length]!;

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ------------------------------------------------------------------ the city behind the glass */

/**
 * Sky, a distant tower on a hill, a modern skyline, and a row of old tiled roofs in front of it. Each layer is a group with
 * data-par: the share of the scene's movement it keeps when you pan, so the far ones slide slower (parallax).
 */
export function CityLayers({ svgRef }: { svgRef: React.Ref<SVGSVGElement> }) {
  const layers = useMemo(() => {
    const r = rng(11);
    const far: { x: number; w: number; h: number; lit: { x: number; y: number }[] }[] = [];
    for (let x = 140; x < 1860; ) {
      const w = 36 + r() * 52;
      const h = 90 + r() * 250 * (r() < 0.2 ? 1.3 : 1);
      const lit = Array.from({ length: Math.floor(r() * 7) }, () => ({ x: 6 + r() * (w - 16), y: 12 + r() * Math.max(10, h - 24) }));
      far.push({ x, w, h, lit });
      x += w + r() * 6;
    }
    const roofs: { x: number; w: number; lit: boolean }[] = [];
    for (let x = 170; x < 1830; ) {
      const w = 90 + r() * 70;
      roofs.push({ x, w, lit: r() < 0.55 });
      x += w + 6 + r() * 26;
    }
    const near = Array.from({ length: 34 }, (_, i) => ({ x: 130 + i * 52 + r() * 20, h: 20 + r() * 44, w: 30 + r() * 40, lit: r() < 0.25 }));
    return { far, roofs, near };
  }, []);

  const base = WIN.y + WIN.h; // the sill hides everything below
  const vb = `${WIN.x} ${WIN.y} ${WIN.w} ${WIN.h}`;
  return (
    <div className="room__city" style={pct(WIN)} aria-hidden="true">
      {/* the sky and its watercolour wash never change, so they are their own layer and are painted once */}
      <svg className="room__citysvg" viewBox={vb}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--sky-top)" }} />
            <stop offset="1" style={{ stopColor: "var(--sky-bottom)" }} />
          </linearGradient>
          <filter id="wash" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="3" seed="4" result="n" />
            <feColorMatrix in="n" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.9 -0.35" />
          </filter>
        </defs>
        <rect x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} fill="url(#sky)" />
        <rect x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} filter="url(#wash)" opacity="0.28" />
      </svg>
      {/* the skyline and the old town: these slide at different speeds as you pan (data-par), and a window light changes now and then */}
      <svg ref={svgRef} className="room__citysvg" viewBox={vb}>
        <defs>
          <radialGradient id="moonglow">
            <stop offset="0" stopColor="#f6f0dc" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f6f0dc" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g data-par="0.04" style={{ opacity: "var(--moon)" }}>
          <circle cx="1196" cy="262" r="86" fill="url(#moonglow)" />
          <circle cx="1196" cy="262" r="30" fill="#f4eed9" />
          {[[760, 190], [840, 150], [1010, 210], [1090, 140], [930, 260], [1260, 190], [790, 300]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={1.6 + (i % 3) * 0.5} fill="#f4eed9" opacity={0.7} />
          ))}
        </g>
        {/* a tower on a hill, far off */}
        <g data-par="0.1">
          <path d={`M900 ${base} C 980 ${base - 130}, 1100 ${base - 140}, 1260 ${base} Z`} style={{ fill: "var(--far)" }} />
          <rect x="1086" y={base - 250} width="7" height="150" style={{ fill: "var(--mid)" }} />
          <ellipse cx="1089.5" cy={base - 214} rx="18" ry="7" style={{ fill: "var(--mid)" }} />
          <rect x="1088" y={base - 290} width="3" height="44" style={{ fill: "var(--mid)" }} />
        </g>
        <g data-par="0.18">
          {layers.far.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={base - b.h} width={b.w} height={b.h + 4} style={{ fill: "var(--far)" }} />
              {b.lit.map((l, j) => (
                <rect key={j} className="room-win" x={b.x + l.x} y={base - b.h + l.y} width="5" height="7" fill="#ffd9a0" />
              ))}
            </g>
          ))}
        </g>
        {/* the old town: tiled roofs with upturned eaves */}
        <g data-par="0.3">
          {layers.roofs.map((o, i) => {
            const y = base - 36;
            return (
              <g key={i} style={{ fill: "var(--mid)" }}>
                <path d={`M${o.x - 6} ${y + 4} C ${o.x + o.w * 0.2} ${y + 10}, ${o.x + o.w * 0.3} ${y - 30}, ${o.x + o.w / 2} ${y - 32} C ${o.x + o.w * 0.7} ${y - 30}, ${o.x + o.w * 0.8} ${y + 10}, ${o.x + o.w + 6} ${y + 4} L ${o.x + o.w} ${y + 14} L ${o.x} ${y + 14} Z`} />
                <rect x={o.x + 8} y={y + 14} width={o.w - 16} height={base - y - 8} />
                {o.lit && <rect className="room-win" x={o.x + o.w / 2 - 5} y={y + 22} width="10" height="12" fill="#ffcf8a" />}
              </g>
            );
          })}
        </g>
        <g data-par="0.42">
          {layers.near.map((n, i) => (
            <g key={i} style={{ fill: "var(--near)" }}>
              <rect x={n.x} y={base - n.h} width={n.w} height={n.h + 4} />
              {n.lit && <rect className="room-win" x={n.x + n.w / 2 - 3} y={base - n.h + 10} width="6" height="8" fill="#ffd9a0" />}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ the room */

const wrap = (title: string, max = 13): string[] => {
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

function Poster({ n, spec }: { n: number; spec: ShelfBookSpec }) {
  const { x, y, w, h } = posterRect(n);
  const open = !spec.locked;
  const paper = mix(spec.accent, "#efe6d2", 0.8);
  const cx = x + w / 2;
  const lines = wrap(spec.title);
  return (
    <g>
      <rect x={x - 9} y={y - 9} width={w + 18} height={h + 18} fill="#5b4330" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} fill="#ece4d1" stroke={INK} strokeWidth="2" />
      {open ? (
        <g>
          <rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} fill={paper} />
          {n === 0 && (
            <g>
              <circle cx={cx} cy={y + 78} r="34" fill={INK} />
              <path d={`M${cx - 4} ${y + 46} A 34 34 0 0 1 ${cx + 30} ${y + 86} A 28 28 0 0 0 ${cx - 4} ${y + 46} Z`} fill="#f2c36b" />
            </g>
          )}
          {n === 1 && (
            <g>
              <circle cx={cx} cy={y + 76} r="38" fill="#f6f0df" stroke={INK} strokeWidth="2.5" />
              <path d={`M${x + 14} ${y + 126} q 14 -10 28 0 t 28 0 t 28 0 t 28 0`} fill="none" stroke={INK} strokeWidth="2.5" />
            </g>
          )}
          {n === 2 && (
            <g>
              <path d={`M${cx - 30} ${y + 124} V ${y + 64} A 30 30 0 0 1 ${cx + 30} ${y + 64} V ${y + 124} Z`} fill={INK} />
              <path d={`M${cx - 18} ${y + 124} V ${y + 70} A 18 18 0 0 1 ${cx + 18} ${y + 70} V ${y + 124} Z`} fill="#f2c36b" />
            </g>
          )}
          {n === 3 && (
            <g fill="none" stroke={INK} strokeWidth="2.5">
              <circle cx={cx} cy={y + 78} r="12" fill={INK} />
              <circle cx={cx} cy={y + 78} r="28" />
              <circle cx={cx} cy={y + 78} r="44" />
            </g>
          )}
          {n === 4 && (
            <g stroke={INK} strokeWidth="2">
              <rect x={x + 20} y={y + 36} width="30" height="86" fill="#c28a3a" />
              <rect x={x + 55} y={y + 36} width="30" height="86" fill="#27385c" />
              <rect x={x + 90} y={y + 36} width="30" height="86" fill="#e0d3b3" />
            </g>
          )}
          {n === 5 && (
            <g>
              <path d={`M${x + 12} ${y + 118} A 58 58 0 0 1 ${x + w - 12} ${y + 118} Z`} fill="#f2c36b" stroke={INK} strokeWidth="2.5" />
              <line x1={x + 6} y1={y + 118} x2={x + w - 6} y2={y + 118} stroke={INK} strokeWidth="3" />
            </g>
          )}
          {lines.map((t, i) => (
            <text key={i} x={cx} y={y + h - 38 + i * 15} textAnchor="middle" fontFamily="var(--serif)" fontSize="14" fontWeight="600" fill={INK}>
              {t}
            </text>
          ))}
        </g>
      ) : (
        <g>
          <rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} fill="#1b140e" />
          <rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} fill="none" stroke="#000" strokeOpacity="0.5" strokeWidth="6" />
          {/* a small brass plate with the date it will be hung */}
          <rect x={cx - 26} y={y + h + 16} width="52" height="20" fill="#b38f4a" stroke={INK} strokeWidth="2" />
          <text x={cx} y={y + h + 30} textAnchor="middle" fontFamily="var(--sans)" fontSize="10" letterSpacing="1.2" fontWeight="600" fill="#2a2010">
            {spec.band ? `${spec.band[0]} ${spec.band[1].toUpperCase()}` : "TBC"}
          </text>
        </g>
      )}
    </g>
  );
}

export function WallArt({ books }: { books: ShelfBookSpec[] }) {
  const shelves = useMemo(() => {
    const r = rng(5);
    const out: { x: number; y: number; w: number; h: number; c: string; stripe: boolean }[] = [];
    for (let c = 0; c < 3; c++) {
      const y1 = 396 + c * 276;
      let x = 82;
      const limit = c === 0 ? 392 : c === 2 ? 372 : 484;
      while (x < limit) {
        const w = 14 + r() * 9;
        const h = 186 + r() * 56;
        out.push({ x, y: y1 - h, w, h, c: SLEEVES[Math.floor(r() * SLEEVES.length)]!, stripe: r() < 0.35 });
        x += w + 1;
      }
    }
    return out;
  }, []);
  const O = { fill: "none", stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };
  return (
    <svg className="room__art" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} aria-hidden="true">
      <defs>
        <linearGradient id="wallg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2f241a" />
          <stop offset="0.5" stopColor="#34271c" />
          <stop offset="1" stopColor="#2b2018" />
        </linearGradient>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="9" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
        </filter>
        <clipPath id="jarclip">
          <path d="M1245 738 C1202 730 1200 650 1236 618 C1245 612 1248 606 1248 600 L1296 600 C1296 606 1299 612 1308 618 C1344 650 1342 730 1299 738 Z" />
        </clipPath>
      </defs>

      {/* wall, with the window cut out of it */}
      <path fillRule="evenodd" d={`M0 0H${SCENE_W}V${SCENE_H}H0Z M${WIN.x} ${WIN.y}H${WIN.x + WIN.w}V${WIN.y + WIN.h}H${WIN.x}Z`} fill="url(#wallg)" />
      <path fillRule="evenodd" d={`M0 0H${SCENE_W}V${SCENE_H}H0Z M${WIN.x} ${WIN.y}H${WIN.x + WIN.w}V${WIN.y + WIN.h}H${WIN.x}Z`} filter="url(#grain)" opacity="0.18" />
      <rect x="0" y="1004" width={SCENE_W} height="76" fill="#1a120c" />
      <line x1="0" y1="1004" x2={SCENE_W} y2="1004" stroke={INK} strokeWidth="3" />

      {/* window */}
      <g fill="#4a3727" stroke={INK} strokeWidth="3" strokeLinejoin="round">
        <rect x="672" y="92" width="656" height="30" />
        <rect x="672" y="92" width="30" height="632" />
        <rect x="1298" y="92" width="30" height="632" />
        <rect x="897" y="122" width="14" height="578" />
        <rect x="1103" y="122" width="14" height="578" />
        <rect x="702" y="402" width="596" height="14" />
        <rect x="650" y="696" width="700" height="36" fill="#5a4330" />
      </g>
      {/* curtains, drawn back */}
      {[false, true].map((flip) => (
        <g key={String(flip)} transform={flip ? `translate(${SCENE_W} 0) scale(-1 1)` : undefined}>
          <path d="M606 98 L722 98 C 716 300 724 520 712 700 C 690 690 664 702 640 700 L612 700 Z" fill="#cfc2a4" fillOpacity="0.92" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M640 100 C 636 300 644 520 636 698 M672 100 C 668 300 678 520 670 698 M702 100 C 698 300 708 520 700 698" fill="none" stroke={INK} strokeOpacity="0.45" strokeWidth="2" />
        </g>
      ))}
      <line x1="586" y1="96" x2="1414" y2="96" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <circle cx="586" cy="96" r="7" fill="#b38f4a" stroke={INK} strokeWidth="2" />
      <circle cx="1414" cy="96" r="7" fill="#b38f4a" stroke={INK} strokeWidth="2" />

      {/* record shelves on the left */}
      <rect x="60" y="120" width="460" height="884" fill="#1d150e" stroke={INK} strokeWidth="3" />
      {[0, 1, 2].map((c) => (
        <rect key={c} x="60" y={396 + c * 276} width="460" height="16" fill="#5b4330" stroke={INK} strokeWidth="3" />
      ))}
      <rect x="60" y="120" width="460" height="16" fill="#5b4330" stroke={INK} strokeWidth="3" />
      {shelves.map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={s.c} stroke={INK} strokeWidth="2" />
          {s.stripe && <rect x={s.x} y={s.y + 28} width={s.w} height="9" fill="#f0e6cf" fillOpacity="0.75" />}
        </g>
      ))}
      {/* a plant on the top shelf, a stack of books on the bottom one */}
      <g>
        <path d="M410 396 L418 336 L452 336 L460 396 Z" fill="#a4553a" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <g fill="#4d7a52" stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M434 336 C 410 300 402 262 420 228 C 436 262 440 300 434 336 Z" />
          <path d="M434 336 C 452 296 478 270 496 252 C 484 292 462 322 434 336 Z" />
          <path d="M434 336 C 428 290 440 246 458 214 C 466 256 454 300 434 336 Z" />
        </g>
        <g stroke={INK} strokeWidth="3">
          <rect x="384" y="936" width="86" height="14" fill="#6f8566" />
          <rect x="390" y="922" width="76" height="14" fill="#8a3b34" />
          <rect x="380" y="908" width="84" height="14" fill="#d1a63f" />
        </g>
      </g>
      {/* a plant on the floor */}
      <g>
        <path d="M528 1004 L536 940 L582 940 L590 1004 Z" fill="#a4553a" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <g fill="#4d7a52" stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M559 940 C 520 880 512 820 540 770 C 566 826 572 886 559 940 Z" />
          <path d="M559 940 C 590 880 626 842 660 822 C 646 876 606 922 559 940 Z" />
          <path d="M559 940 C 546 868 566 806 596 756 C 612 820 590 884 559 940 Z" />
          <path d="M559 940 C 520 912 486 896 470 860 C 506 868 540 900 559 940 Z" />
        </g>
      </g>

      {/* the credenza */}
      <rect x="560" y="764" width="1400" height="240" fill="#4f3a28" stroke={INK} strokeWidth="3" />
      {Array.from({ length: 7 }, (_, i) => {
        const x = 560 + i * 200;
        return (
          <g key={i}>
            <rect x={x + 8} y="776" width="184" height="216" fill="#58412d" stroke={INK} strokeWidth="2.5" />
            <rect x={x + 24} y="792" width="152" height="184" fill="#4a3625" stroke={INK} strokeWidth="2" />
            <rect x={i % 2 ? x + 30 : x + 164} y="860" width="6" height="42" fill="#b38f4a" stroke={INK} strokeWidth="1.5" />
          </g>
        );
      })}
      <rect x="548" y="742" width="1424" height="22" fill="#6a4f37" stroke={INK} strokeWidth="3" />
      <g fill="#2b1f15" stroke={INK} strokeWidth="2.5">
        {[600, 1000, 1400, 1900].map((x) => (
          <path key={x} d={`M${x - 14} 1004 L${x - 10} 1030 L${x + 10} 1030 L${x + 14} 1004 Z`} />
        ))}
      </g>

      {/* the turntable: plinth, a pool of platter, the tonearm's post. The platter and arm move, so they are drawn separately. */}
      <g>
        <path d="M770 700 L1070 700 L1050 646 L790 646 Z" fill="#3d2d21" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M770 700 L1070 700 L1070 742 L770 742 Z" fill="#241a13" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <line x1="770" y1="702" x2="1070" y2="702" stroke="#b38f4a" strokeWidth="2.5" />
        <ellipse cx="905" cy="676" rx="120" ry="34" fill="#17110d" stroke={INK} strokeWidth="2.5" />
        <rect x="1004" y="636" width="12" height="24" fill="#8a6c34" stroke={INK} strokeWidth="2" />
        <ellipse cx="1010" cy="636" rx="10" ry="4" fill="#b38f4a" stroke={INK} strokeWidth="2" />
        <circle cx="1040" cy="715" r="6" fill="#b38f4a" stroke={INK} strokeWidth="1.5" />
        <circle cx="1020" cy="715" r="6" fill="#b38f4a" stroke={INK} strokeWidth="1.5" />
      </g>

      {/* lamp */}
      <g>
        <rect x="651" y="680" width="38" height="62" fill="#9a7a3c" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <rect x="664" y="646" width="12" height="36" fill="#9a7a3c" stroke={INK} strokeWidth="2.5" />
        <path d="M624 660 L716 660 L698 604 L642 604 Z" fill="#e0a24a" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <path d="M642 604 L698 604 L704 624 L636 624 Z" fill="#f2c36b" fillOpacity="0.55" />
      </g>

      {/* the moon jar */}
      <g>
        <path d="M1245 738 C1202 730 1200 650 1236 618 C1245 612 1248 606 1248 600 L1296 600 C1296 606 1299 612 1308 618 C1344 650 1342 730 1299 738 Z" fill="#ece3cf" />
        <g clipPath="url(#jarclip)">
          <rect x="1290" y="590" width="60" height="160" fill="#c9bda1" fillOpacity="0.7" />
          <path d="M1218 700 C1214 664 1226 636 1244 626" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="9" strokeLinecap="round" />
        </g>
        <path d="M1245 738 C1202 730 1200 650 1236 618 C1245 612 1248 606 1248 600 L1296 600 C1296 606 1299 612 1308 618 C1344 650 1342 730 1299 738 Z" {...O} />
        <ellipse cx="1272" cy="600" rx="24" ry="5" fill="#8c8068" stroke={INK} strokeWidth="2" />
        <path d="M1272 614 L1272 734" stroke={INK} strokeOpacity="0.18" strokeWidth="2" />
      </g>

      {/* an open book and a pencil on the credenza: the folk tale, and a bowl beside them */}
      <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
        <path d="M1482 741 L1566 750 L1650 741 L1650 746 L1566 755 L1482 746 Z" fill="#27385c" />
        <path d="M1488 741 L1566 746 L1566 716 L1496 711 Z" fill="#f0e7d1" />
        <path d="M1566 746 L1644 741 L1636 711 L1566 716 Z" fill="#f3ecd8" />
        <path d="M1566 716 L1566 746" fill="none" strokeWidth="2" />
        <path d="M1500 719 L1558 723 M1500 726 L1558 730 M1500 733 L1556 737 M1574 723 L1630 719 M1574 730 L1630 726 M1574 737 L1630 733" fill="none" strokeWidth="1.4" strokeOpacity="0.55" />
        <path d="M1656 742 L1716 728" fill="none" stroke="#d9b45a" strokeWidth="5" />
        <path d="M1716 728 L1726 725.6" fill="none" strokeWidth="3" />
        <path d="M1772 742 C1772 700 1862 700 1862 742 Z" fill="#d8cdb3" />
      </g>

      {/* the gallery: six frames. Open chapters have their poster; the rest wait as empty frames with a brass plate. */}
      {books.map((b, i) => (
        <Poster key={i} n={i} spec={b} />
      ))}
    </svg>
  );
}
