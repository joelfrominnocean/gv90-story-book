import { useId, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactElement } from "react";
import { isLegal, pointName, type Game } from "./engine";

interface Props {
  game: Game;
  /** The board you play on (large, top-down) or the one on the table in the room (small, warped, only to be looked at). */
  mode: "play" | "table";
  /** Whether it is your turn and a tap would play a stone. */
  canPlay?: boolean;
  onPlay?: (point: number) => void;
  label?: string;
}

const STAR_9 = [[2, 2], [6, 2], [2, 6], [6, 6], [4, 4]] as const;

/**
 * A Baduk board, drawn as a picture of one: a wood face with a grain, thin ink lines, the nine star points, stones that are lit from
 * above and left and cast a short shadow. `table` mode draws only the lines and stones (the board itself is the wood of the model on
 * the table, under it) and with heavier lines, because it is seen small. `play` mode takes a touch: the stone shows where it would go
 * while a finger is down or a mouse hovers, and is placed when the finger lifts, so you can slide to the right point before you commit.
 */
export function BadukBoard({ game, mode, canPlay = false, onPlay, label }: Props) {
  const n = game.n;
  const vb = n + 1;
  const id = useId().replace(/:/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [down, setDown] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const table = mode === "table";
  const line = table ? 0.075 : 0.032;

  const pointAt = (e: RPointerEvent): number | null => {
    const el = svg.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const gx = Math.round(((e.clientX - r.left) / r.width) * vb - 1);
    const gy = Math.round(((e.clientY - r.top) / r.height) * vb - 1);
    return gx < 0 || gy < 0 || gx >= n || gy >= n ? null : gy * n + gx;
  };
  const show = (p: number | null) => setHover(p !== null && canPlay && isLegal(game, p) ? p : null);

  const onKey = (e: KeyboardEvent) => {
    if (table || !canPlay) return;
    const c = cursor ?? Math.floor((n * n) / 2);
    const x = c % n;
    const y = (c - x) / n;
    let next = c;
    if (e.key === "ArrowLeft") next = y * n + Math.max(0, x - 1);
    else if (e.key === "ArrowRight") next = y * n + Math.min(n - 1, x + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, y - 1) * n + x;
    else if (e.key === "ArrowDown") next = Math.min(n - 1, y + 1) * n + x;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (isLegal(game, c)) onPlay?.(c);
      return;
    } else return;
    e.preventDefault();
    setCursor(next);
  };

  const stones: ReactElement[] = [];
  for (let i = 0; i < n * n; i++) {
    const v = game.board[i]!;
    if (!v) continue;
    const x = (i % n) + 1;
    const y = Math.floor(i / n) + 1;
    const fresh = i === game.last;
    stones.push(
      <g key={`${i}-${v}`} className={fresh ? "baduk__stone baduk__stone--new" : "baduk__stone"} style={{ transformOrigin: `${x}px ${y}px` }}>
        <ellipse cx={x + 0.05} cy={y + 0.09} rx={0.45} ry={0.43} fill="#000" opacity={table ? 0.3 : 0.34} />
        <circle cx={x} cy={y} r={0.46} fill={`url(#${id}${v === 1 ? "b" : "w"})`} />
        {fresh && !table && <circle cx={x} cy={y} r={0.17} fill="none" stroke={v === 1 ? "#d8cfbb" : "#3a3326"} strokeWidth={0.05} opacity={0.8} />}
      </g>,
    );
  }
  const ghost = mode === "play" && canPlay ? (down || hover !== null ? hover : null) : null;
  const key = cursor !== null && canPlay ? cursor : null;

  return (
    <svg
      ref={svg}
      className={`baduk baduk--${mode}`}
      viewBox={`0 0 ${vb} ${vb}`}
      role={table ? "img" : "application"}
      aria-label={label}
      tabIndex={table ? -1 : 0}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        if (table || !canPlay) return;
        setDown(true);
        show(pointAt(e));
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (table || !canPlay) return;
        if (e.pointerType === "mouse" || down) show(pointAt(e));
      }}
      onPointerUp={(e) => {
        if (table) return;
        const p = down ? pointAt(e) : null;
        setDown(false);
        setHover(null);
        if (p !== null && canPlay && isLegal(game, p)) onPlay?.(p);
      }}
      onPointerLeave={() => !down && setHover(null)}
      onPointerCancel={() => {
        setDown(false);
        setHover(null);
      }}
    >
      <defs>
        <radialGradient id={`${id}b`} cx="0.36" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#5a5a58" />
          <stop offset="0.45" stopColor="#1d1d1c" />
          <stop offset="1" stopColor="#070707" />
        </radialGradient>
        <radialGradient id={`${id}w`} cx="0.36" cy="0.32" r="0.85">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="0.6" stopColor="#e6dfcd" />
          <stop offset="1" stopColor="#b9b19c" />
        </radialGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c8a56a" />
          <stop offset="0.5" stopColor="#d3b176" />
          <stop offset="1" stopColor="#c19d62" />
        </linearGradient>
        <pattern id={`${id}g`} width="10" height="0.32" patternUnits="userSpaceOnUse">
          <rect width="10" height="0.32" fill="none" />
          <path d="M0 0.07 H10 M0 0.2 H10" stroke="#8a6a38" strokeWidth="0.018" opacity="0.28" />
        </pattern>
      </defs>
      {!table && (
        <>
          <rect x={0} y={0} width={vb} height={vb} rx={0.12} fill={`url(#${id}f)`} />
          <rect x={0} y={0} width={vb} height={vb} rx={0.12} fill={`url(#${id}g)`} />
        </>
      )}
      <g stroke="#2a1d10" strokeLinecap="square" opacity={table ? 0.85 : 0.9}>
        {Array.from({ length: n }, (_, k) => (
          <g key={k}>
            <path d={`M1 ${k + 1} H${n}`} strokeWidth={k === 0 || k === n - 1 ? line * 1.7 : line} />
            <path d={`M${k + 1} 1 V${n}`} strokeWidth={k === 0 || k === n - 1 ? line * 1.7 : line} />
          </g>
        ))}
      </g>
      {n === 9 && STAR_9.map(([sx, sy]) => <circle key={`${sx}${sy}`} cx={sx + 1} cy={sy + 1} r={table ? 0.15 : 0.1} fill="#2a1d10" />)}
      {stones}
      {ghost !== null && <circle cx={(ghost % n) + 1} cy={Math.floor(ghost / n) + 1} r={0.46} fill={`url(#${id}b)`} opacity={0.5} />}
      {key !== null && <rect x={(key % n) + 0.55} y={Math.floor(key / n) + 0.55} width={0.9} height={0.9} fill="none" stroke="#2a1d10" strokeWidth={0.05} strokeDasharray="0.12 0.1" rx={0.1} />}
      <title>{label}</title>
      {key !== null && <desc>{pointName(key, n)}</desc>}
    </svg>
  );
}
