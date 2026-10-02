import type { ReactNode } from "react";

/**
 * Six illustrations for the folk tale, drawn in the room's language: flat fills, ink outlines, and a watercolour wash over the
 * sky. They are a scamp. What is meant to carry over to an illustrator is the sequence of images (one per page) and the way
 * each is composed; the drawings themselves are to be replaced.
 */
const INK = "#14100c";
const line = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Frame({ n, top, bottom, children }: { n: number; top: string; bottom: string; children: ReactNode }) {
  return (
    <svg className="tale__art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={`sky${n}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <filter id={`wash${n}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.014 0.03" numOctaves="3" seed={n + 2} />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 -0.42" />
        </filter>
        <filter id={`grain${n}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={n + 9} />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
        </filter>
      </defs>
      <rect width="400" height="300" fill={`url(#sky${n})`} />
      <rect width="400" height="300" filter={`url(#wash${n})`} opacity="0.3" />
      {children}
      <rect width="400" height="300" filter={`url(#grain${n})`} opacity="0.16" />
    </svg>
  );
}

const Stars = ({ seed, count = 40, region = [0, 0, 400, 150] }: { seed: number; count?: number; region?: number[] }) => {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const [x0, y0, x1, y1] = region as [number, number, number, number];
  return (
    <g fill="#f4eed9">
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} cx={x0 + r() * (x1 - x0)} cy={y0 + r() * (y1 - y0)} r={0.5 + r() * 1.3} opacity={0.35 + r() * 0.6} />
      ))}
    </g>
  );
};

/** A person in a long skirt and short jacket: no face, which is how they are in the stories. */
function Person({ x, y, s = 1, skirt = "#b8452f", top = "#efe6d2", basket = false, arms = false }: { x: number; y: number; s?: number; skirt?: string; top?: string; basket?: boolean; arms?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} {...line}>
      <path d="M0 -26 L-11 0 L11 0 Z" fill={skirt} />
      <path d="M-5 -27 L5 -27 L7 -19 L-7 -19 Z" fill={top} />
      <circle cx="0" cy="-33" r="5" fill="#e8cfae" />
      <path d="M-5 -35 C-5 -41 5 -41 5 -35 C3 -37 -3 -37 -5 -35 Z" fill={INK} />
      {basket && <ellipse cx="0" cy="-41" rx="8" ry="3.4" fill="#c79a5a" />}
      {arms && <path d="M-6 -24 L-9 -38 M6 -24 L9 -38" fill="none" />}
    </g>
  );
}

function Tiger({ x, y, s = 1, flip = false, up = 0 }: { x: number; y: number; s?: number; flip?: boolean; up?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} {...line}>
      <path d="M62 -10 C 76 -22 84 -38 78 -52" fill="none" stroke="#d98a2c" strokeWidth="9" />
      <path d="M62 -10 C 76 -22 84 -38 78 -52" fill="none" stroke={INK} strokeWidth="9" strokeDasharray="3 6" opacity="0.8" />
      <path d="M-40 0 C-42 -30 -10 -48 30 -46 C 62 -44 76 -26 72 0 L 62 0 L 58 -14 L 40 -12 L 38 0 L 24 0 L 20 -12 L -10 -10 L -14 0 Z" fill="#d98a2c" />
      <g stroke={INK} strokeWidth="3.2" fill="none">
        <path d="M0 -44 C 4 -34 4 -24 -2 -12" />
        <path d="M14 -46 C 19 -34 19 -22 14 -11" />
        <path d="M28 -46 C 33 -34 33 -22 28 -11" />
        <path d="M42 -44 C 47 -34 46 -24 42 -13" />
        <path d="M56 -38 C 60 -30 60 -22 57 -14" />
      </g>
      <g transform={`translate(-34 -36) rotate(${-up})`}>
        <path d="M-10 -14 L-6 -26 L4 -17 Z M12 -17 L20 -26 L22 -12 Z" fill="#d98a2c" />
        <circle cx="4" cy="0" r="22" fill="#d98a2c" />
        <path d="M-6 -16 L-4 -8 M4 -19 L4 -10 M14 -16 L12 -8" fill="none" stroke={INK} strokeWidth="2.6" />
        <ellipse cx="-4" cy="-2" rx="4.4" ry="2.6" fill="#f6e08a" />
        <ellipse cx="14" cy="-2" rx="4.4" ry="2.6" fill="#f6e08a" />
        <path d="M-5 -3 h2 M13 -3 h2" stroke={INK} strokeWidth="2" fill="none" />
        <path d="M2 6 L6 6 L4 10 Z" fill={INK} />
        <path d="M4 10 C 0 15 -4 14 -6 12 M4 10 C 8 15 12 14 14 12" fill="none" />
        <path d="M-14 6 L-26 3 M-14 9 L-26 10 M22 6 L34 3 M22 9 L34 10" fill="none" strokeWidth="1" />
      </g>
    </g>
  );
}

function Scene1() {
  return (
    <Frame n={1} top="#7792b0" bottom="#f1c394">
      <circle cx="310" cy="188" r="62" fill="#f6c46d" opacity="0.35" />
      <path d="M0 190 L60 148 L112 176 L172 128 L232 172 L300 138 L400 186 V300 H0 Z" fill="#6f87a3" {...line} />
      <path d="M0 222 L70 186 L140 216 L222 174 L312 216 L400 196 V300 H0 Z" fill="#4d6882" {...line} />
      <path d="M0 252 C 120 214 260 238 400 206 V300 H0 Z" fill="#2f4558" {...line} />
      <path d="M12 296 C 86 262 150 270 204 246 S 290 224 322 220" fill="none" stroke="#e9d9b8" strokeWidth="11" opacity="0.85" strokeLinecap="round" />
      <g {...line}>
        <path d="M296 200 C 314 204 322 184 336 182 C 350 184 356 204 376 200 L 370 208 H 302 Z" fill="#1d2630" />
        <rect x="306" y="208" width="60" height="16" fill="#3b2a20" />
        <rect x="322" y="211" width="13" height="9" fill="#ffd28a" />
        <rect x="344" y="212" width="8" height="12" fill="#241a12" />
      </g>
      <circle cx="326" cy="216" r="2.3" fill={INK} />
      <circle cx="331.5" cy="216.5" r="2.3" fill={INK} />
      <Person x={156} y={268} s={1.1} basket />
      <g fill="#f4eed9" opacity="0.8">
        <circle cx="60" cy="40" r="1.3" />
        <circle cx="120" cy="22" r="1" />
        <circle cx="200" cy="48" r="1.2" />
      </g>
    </Frame>
  );
}

function Scene2() {
  return (
    <Frame n={2} top="#1f2c4a" bottom="#6f6a85">
      <Stars seed={7} count={26} region={[0, 0, 400, 120]} />
      <path d="M88 52 a 18 18 0 1 0 0 1 a 14 14 0 1 1 0 -1 Z" fill="#f2ecd8" />
      <path d="M0 196 C 90 168 170 190 250 170 S 360 176 400 168 V300 H0 Z" fill="#27364f" {...line} />
      <path d="M0 246 C 120 226 280 240 400 220 V300 H0 Z" fill="#2c3d4c" {...line} />
      <path d="M6 296 C 100 270 190 268 260 258" fill="none" stroke="#c9b894" strokeWidth="11" opacity="0.55" strokeLinecap="round" />
      <g fill="#f4eed9" {...line} strokeWidth="1">
        <ellipse cx="152" cy="262" rx="5" ry="3" />
        <ellipse cx="164" cy="266" rx="5" ry="3" />
        <ellipse cx="176" cy="262" rx="5" ry="3" />
      </g>
      <Person x={104} y={262} s={1.5} basket />
      <Tiger x={262} y={262} s={1.25} />
    </Frame>
  );
}

function Scene3() {
  return (
    <Frame n={3} top="#172038" bottom="#3a4770">
      <Stars seed={3} count={34} region={[0, 0, 400, 130]} />
      <circle cx="334" cy="58" r="22" fill="#f2ecd8" />
      <path d="M0 236 C 100 218 280 232 400 214 V300 H0 Z" fill="#232f44" {...line} />
      {/* the house, the door a little open, the lamp inside */}
      <g {...line}>
        <path d="M24 134 C 56 140 68 106 100 102 C 132 106 144 140 176 134 L 168 148 H 32 Z" fill="#12171f" />
        <rect x="34" y="148" width="132" height="76" fill="#3b2a20" />
        <rect x="52" y="164" width="30" height="24" fill="#ffd28a" />
        <rect x="104" y="156" width="40" height="68" fill="#ffcf84" />
      </g>
      {/* a figure in Mother's clothes at the door, with a striped hand */}
      <Person x={124} y={226} s={1.5} skirt="#8f3a2c" />
      <g {...line}>
        <path d="M112 196 L 96 190" stroke="#d98a2c" strokeWidth="7" fill="none" />
        <path d="M110 196 L 108 190 M105 194 L 103 188" stroke={INK} strokeWidth="2" fill="none" />
      </g>
      <circle cx="124" cy="176.5" r="9" fill="#1b1209" {...line} />
      <path d="M120 175 h2.6 M126.4 175 h2.6" stroke="#f6e08a" strokeWidth="2.2" strokeLinecap="round" />
      {/* the tall tree by the well, and two small figures running to it */}
      <g {...line}>
        <path d="M300 226 C 304 180 296 140 302 96 L 322 96 C 326 140 320 182 326 226 Z" fill="#4a3626" />
        <ellipse cx="312" cy="78" rx="62" ry="46" fill="#2e5a57" />
        <ellipse cx="282" cy="96" rx="34" ry="26" fill="#214542" />
        <ellipse cx="344" cy="96" rx="34" ry="26" fill="#214542" />
        <ellipse cx="236" cy="232" rx="20" ry="7" fill="#7a7f86" />
        <ellipse cx="236" cy="229" rx="14" ry="4" fill="#111a2a" />
      </g>
      <Person x={262} y={242} s={0.8} skirt="#b8452f" />
      <Person x={282} y={246} s={0.8} skirt="#3f6aa6" />
    </Frame>
  );
}

function Scene4() {
  return (
    <Frame n={4} top="#16203a" bottom="#2f3c66">
      <circle cx="68" cy="56" r="24" fill="#f2ecd8" />
      <g {...line}>
        <path d="M184 300 C 190 240 178 200 186 150 L 214 150 C 222 200 210 240 216 300 Z" fill="#4a3626" />
        <path d="M200 170 C 150 160 120 150 96 126 M204 150 C 252 138 290 130 316 104" fill="none" stroke="#4a3626" strokeWidth="9" />
        <ellipse cx="200" cy="70" rx="150" ry="70" fill="#2e5a57" />
        <ellipse cx="96" cy="108" rx="60" ry="36" fill="#244a48" />
        <ellipse cx="312" cy="96" rx="64" ry="38" fill="#244a48" />
        <ellipse cx="200" cy="120" rx="52" ry="26" fill="#214542" />
      </g>
      <Stars seed={5} count={26} region={[60, 20, 340, 100]} />
      <Person x={150} y={134} s={0.85} skirt="#b8452f" />
      <Person x={256} y={126} s={0.85} skirt="#3f6aa6" />
      <path d="M0 264 C 100 248 300 262 400 246 V300 H0 Z" fill="#22304a" {...line} />
      <ellipse cx="86" cy="270" rx="24" ry="8" fill="#7a7f86" {...line} />
      <ellipse cx="86" cy="267" rx="17" ry="4.5" fill="#0d1526" />
      <Tiger x={150} y={282} s={0.95} up={34} />
    </Frame>
  );
}

function Scene5() {
  return (
    <Frame n={5} top="#0d1530" bottom="#27396a">
      <Stars seed={11} count={70} region={[0, 0, 400, 220]} />
      <path d="M0 270 C 100 250 300 268 400 250 V300 H0 Z" fill="#141c34" {...line} />
      <g className="tale__rope">
        <path d="M200 -6 C 208 50 196 100 204 224" fill="none" stroke="#b8452f" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M200 -6 C 208 50 196 100 204 224" fill="none" stroke="#f1b79a" strokeWidth="5.5" strokeDasharray="2 5" opacity="0.7" />
        <g transform="translate(203 128)" {...line}>
          <path d="M0 -4 L-6 18 L6 18 Z" fill="#3f6aa6" />
          <circle r="4.4" cy="-9" fill="#e8cfae" />
          <path d="M-3 -2 L-2 -12 M3 -2 L2 -12" fill="none" />
        </g>
        <g transform="translate(200 170)" {...line}>
          <path d="M0 -4 L-6 18 L6 18 Z" fill="#b8452f" />
          <circle r="4.4" cy="-9" fill="#e8cfae" />
          <path d="M-3 -2 L-2 -12 M3 -2 L2 -12" fill="none" />
        </g>
      </g>
      {/* the rotten rope breaks, and the tiger falls */}
      <path d="M330 -6 C 326 60 336 100 322 150" fill="none" stroke="#c9b894" strokeWidth="2.6" strokeDasharray="5 3" />
      <path d="M322 150 l-6 8 M322 150 l5 9 M322 150 l-1 10" stroke="#c9b894" strokeWidth="1.4" />
      <g transform="translate(300 214) rotate(150)">
        <Tiger x={0} y={0} s={0.5} />
      </g>
      <path d="M318 176 l4 -14 M308 172 l2 -12 M328 180 l5 -12" stroke="#f4eed9" strokeWidth="1.2" opacity="0.6" />
    </Frame>
  );
}

function Scene6() {
  return (
    <svg className="tale__art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="day6" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7dca8" />
          <stop offset="1" stopColor="#f0a56c" />
        </linearGradient>
        <linearGradient id="night6" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141c3c" />
          <stop offset="1" stopColor="#3d4d80" />
        </linearGradient>
        <filter id="wash6" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.014 0.03" numOctaves="3" seed="8" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 -0.42" />
        </filter>
        <filter id="grain6" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="14" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" />
        </filter>
        <clipPath id="dayclip">
          <path d="M0 0 H 236 L 164 300 H 0 Z" />
        </clipPath>
        <clipPath id="nightclip">
          <path d="M236 0 H 400 V 300 H 164 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#dayclip)">
        <rect width="400" height="300" fill="url(#day6)" />
        <circle cx="96" cy="104" r="78" fill="#fff3c9" opacity="0.4" />
        <g stroke="#f4b244" strokeWidth="3" strokeLinecap="round" opacity="0.9">
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            return <line key={i} x1={96 + Math.cos(a) * 52} y1={104 + Math.sin(a) * 52} x2={96 + Math.cos(a) * (62 + (i % 2) * 8)} y2={104 + Math.sin(a) * (62 + (i % 2) * 8)} />;
          })}
        </g>
        <circle cx="96" cy="104" r="42" fill="#f4b244" {...line} />
      </g>
      <g clipPath="url(#nightclip)">
        <rect width="400" height="300" fill="url(#night6)" />
        <Stars seed={21} count={46} region={[170, 0, 400, 200]} />
        <circle cx="306" cy="92" r="54" fill="#f2ecd8" opacity="0.18" />
        <circle cx="306" cy="92" r="34" fill="#f2ecd8" {...line} />
        <g fill="#d8d0b6" opacity="0.7">
          <circle cx="296" cy="84" r="6" />
          <circle cx="318" cy="100" r="4.5" />
          <circle cx="308" cy="74" r="2.6" />
        </g>
      </g>
      <rect width="400" height="300" filter="url(#wash6)" opacity="0.26" />
      <path d="M0 232 L58 196 L108 224 L168 178 L226 220 L286 188 L344 218 L400 196 V300 H0 Z" fill="#1d2a3a" {...line} />
      <path d="M0 262 C 120 242 280 262 400 240 V300 H0 Z" fill="#141e2b" {...line} />
      <rect width="400" height="300" filter="url(#grain6)" opacity="0.16" />
    </svg>
  );
}

const SCENES = [Scene1, Scene2, Scene3, Scene4, Scene5, Scene6];
export const TALE_SCENES = SCENES.length;
export function TaleArt({ n }: { n: number }) {
  const Scene = SCENES[Math.min(n, SCENES.length - 1)]!;
  return <Scene />;
}
