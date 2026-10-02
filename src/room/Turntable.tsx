import { useEffect, useRef } from "react";
import { HOT, TURNTABLE_BOX, sleeveColour } from "./RoomArt";

const INK = "#120d09";
/** Where the arm points (degrees from the +x axis, in the platter's plane) at rest and with the needle in the groove. */
const ARM_REST = 105;
const ARM_PLAY = 152;
/** 33 1/3 rpm. */
const DEG_PER_SEC = 200;

/**
 * The parts of the turntable that move: the platter, which turns up to speed and coasts to a stop; the tonearm, which swings
 * over and down; and the sleeve of the record that is playing, which stands beside it. Drawn in its own small SVG so the
 * rest of the room is not repainted every frame. Coordinates are the scene's.
 */
export function Turntable({ playing, track, reduceMotion }: { playing: boolean; track: number; reduceMotion: boolean }) {
  const platter = useRef<SVGGElement>(null);
  const target = useRef(0);
  const loop = useRef(0);
  const state = useRef({ angle: 0, vel: 0, last: 0 });

  useEffect(() => {
    target.current = playing ? DEG_PER_SEC : 0;
    if (loop.current) return;
    const s = state.current;
    s.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;
      // up to speed in about a second and a half; coasting to a stop takes longer
      const tau = target.current > s.vel ? 0.8 : 1.6;
      s.vel += (target.current - s.vel) * (1 - Math.exp(-dt / tau));
      s.angle = (s.angle + s.vel * dt) % 360;
      platter.current?.setAttribute("transform", `rotate(${s.angle.toFixed(2)})`);
      if (s.vel > 0.4 || target.current > 0) loop.current = requestAnimationFrame(step);
      else loop.current = 0;
    };
    loop.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(loop.current);
      loop.current = 0;
    };
  }, [playing]);

  const { x, y, w, h } = TURNTABLE_BOX;
  const c = sleeveColour(track);
  return (
    <svg className="room__turntable" viewBox={`${x} ${y} ${w} ${h}`} aria-hidden="true">
      {/* the sleeve standing beside the player; it changes with the record */}
      <g transform={`rotate(-6 ${HOT.sleeve.x + 46} 742)`}>
        <rect x={HOT.sleeve.x + 6} y="638" width="86" height="104" fill={c} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <circle cx={HOT.sleeve.x + 49} cy="682" r="22" fill="#f0e6cf" fillOpacity="0.85" stroke={INK} strokeWidth="2" />
        <circle cx={HOT.sleeve.x + 49} cy="682" r="5" fill={INK} />
        <rect x={HOT.sleeve.x + 16} y="716" width="40" height="5" fill={INK} fillOpacity="0.7" />
        <rect x={HOT.sleeve.x + 16} y="726" width="26" height="4" fill={INK} fillOpacity="0.5" />
      </g>
      {/* the platter, drawn flat and squashed into the room's perspective, so it turns as an ellipse */}
      <g transform="translate(905 676) scale(1 0.3)">
        <circle r="112" fill="#0d0a09" stroke={INK} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <g ref={platter}>
          {[100, 88, 76, 64, 52].map((r) => (
            <circle key={r} r={r} fill="none" stroke="#2c2622" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ))}
          <path d="M0 0 L112 0 A112 112 0 0 0 79 -79 Z" fill="#fff" fillOpacity="0.07" />
          <path d="M0 0 L-112 0 A112 112 0 0 0 -79 79 Z" fill="#fff" fillOpacity="0.05" />
          <circle r="34" fill="#c9733a" stroke={INK} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <line x1="-34" y1="0" x2="-12" y2="0" stroke={INK} strokeOpacity="0.55" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          <line x1="12" y1="0" x2="34" y2="0" stroke={INK} strokeOpacity="0.55" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          <circle r="4" fill={INK} />
        </g>
      </g>
      {/* the tonearm, pivoting at the back right */}
      <g transform="translate(1010 657) scale(1 0.3)">
        <g
          style={{
            transform: `rotate(${playing ? ARM_PLAY : ARM_REST}deg)`,
            transition: reduceMotion ? "none" : "transform 1.35s cubic-bezier(0.45, 0.05, 0.25, 1)",
          }}
        >
          <line x1="-22" y1="0" x2="186" y2="0" stroke="#d4c49a" strokeWidth="5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <rect x="-34" y="-9" width="18" height="18" fill="#8a6c34" stroke={INK} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <rect x="178" y="-8" width="26" height="16" fill="#1a1410" stroke={INK} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </g>
      </g>
    </svg>
  );
}
