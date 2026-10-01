import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import type { ShelfBookSpec } from "../book3d/shelf";
import { asset } from "../content/asset";
import { WALL_BOOK_FRAC } from "./focus";
import { plateImage } from "./image";
import { layout, rectStyle } from "./layout";

/** Pan and zoom state: the plate point at the centre of the screen (0..1 each way) and the zoom (1 = plate height fills the screen). */
interface View {
  s: number;
  cu: number;
  cv: number;
}
interface Geom {
  vw: number;
  vh: number;
  /** The plate's size at zoom 1: as tall as the screen, or as wide if the screen is very wide. */
  W0: number;
  H0: number;
}

const S_MAX = 2.6;
/** Opening zoom: the six books and the fire fill the screen, the rest of the wall is a drag away. */
const S_FOCUS = 1.6;
const BAY_V = 0.66;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const geomFor = (vw: number, vh: number): Geom => {
  const H0 = Math.max(vh, vw / layout.aspect);
  return { vw, vh, H0, W0: H0 * layout.aspect };
};

/** Furthest out: the whole wall, edge to edge, which on a tall phone leaves dark above and below it. */
const sMin = (g: Geom): number => Math.min(1, g.vw / g.W0);

function clampView(v: View, g: Geom): View {
  const s = Math.min(S_MAX, Math.max(sMin(g), v.s));
  const hu = Math.min(0.5, g.vw / 2 / (g.W0 * s));
  const hv = Math.min(0.5, g.vh / 2 / (g.H0 * s));
  return { s, cu: Math.min(1 - hu, Math.max(hu, v.cu)), cv: Math.min(1 - hv, Math.max(hv, v.cv)) };
}

const focusView = (g: Geom): View => clampView({ s: S_FOCUS, cu: (layout.bay.u0 + layout.bay.u1) / 2, cv: BAY_V }, g);
const overviewView = (g: Geom): View => clampView({ s: sMin(g), cu: 0.5, cv: 0.5 }, g);

/** The view in which book n is centred and WALL_BOOK_FRAC of the screen tall, exactly where the 3D camera will put it. Not clamped. */
function matchView(n: number, g: Geom): View {
  const b = layout.books[n]!;
  return { s: (WALL_BOOK_FRAC * g.vh) / ((b.v1 - b.v0) * g.H0), cu: (b.u0 + b.u1) / 2, cv: (b.v0 + b.v1) / 2 };
}

export interface WallPlateHandle {
  toggleZoom: () => void;
}

interface Props {
  /** Size of the book area in CSS px. */
  size: { width: number; height: number };
  books: ShelfBookSpec[];
  labels: string[];
  /** A book is moving: the buttons wait. */
  busy: boolean;
  /** The book being taken down: the plate zooms until it is lined up with the 3D camera, then `onFocused`. null = free to look around. */
  focusN: number | null;
  /** Show the shelf with this book missing (the real one is off the shelf). */
  patchN: number | null;
  /** A book is down and the plate is hidden behind it: stop the fire to save the battery. */
  paused: boolean;
  reduceMotion: boolean;
  onPick: (n: number) => void;
  onFocused: () => void;
  onLoaded: () => void;
  onFailed: () => void;
  onZoomedOut: (out: boolean) => void;
}

/**
 * The library: one wide picture of the whole bookcase wall (a Blender render), larger than the screen. You drag to look
 * along it. The six books are buttons over their spines, glowing where the chapter is open; the fire is real footage
 * set into the fireplace. Picking a book zooms the picture to the exact view the 3D camera will use, and the real book
 * is lifted out of the very place the picture shows it.
 */
export const WallPlate = forwardRef<WallPlateHandle, Props>(function WallPlate(
  { size, books, labels, busy, focusN, patchN, paused, reduceMotion, onPick, onFocused, onLoaded, onFailed, onZoomedOut },
  ref,
) {
  const viewEl = useRef<HTMLDivElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const flicker = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const geom = useRef<Geom>(geomFor(size.width, size.height));
  const view = useRef<View | null>(null);
  const raf = useRef(0);
  const inertia = useRef(0);
  const suppressClick = useRef(false);
  const doneRef = useRef(onFocused);
  doneRef.current = onFocused;
  const focusRef = useRef(focusN);
  focusRef.current = focusN;
  const outRef = useRef(false);
  const [loaded, setLoaded] = useState(false);

  const apply = useCallback((v: View) => {
    const g = geom.current;
    view.current = v;
    const el = plate.current;
    if (!el) return;
    const w = g.W0 * v.s;
    el.style.width = `${w}px`;
    el.style.height = `${g.H0 * v.s}px`;
    el.style.setProperty("--pw", `${w}px`);
    el.style.transform = `translate3d(${g.vw / 2 - v.cu * w}px, ${g.vh / 2 - v.cv * g.H0 * v.s}px, 0)`;
    const out = v.s < (sMin(g) + S_FOCUS) / 2;
    if (out !== outRef.current) {
      outRef.current = out;
      onZoomedOut(out);
    }
  }, [onZoomedOut]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    cancelAnimationFrame(inertia.current);
  }, []);

  const animateTo = useCallback(
    (to: View, ms: number, done?: () => void) => {
      stop();
      const from = view.current ?? to;
      const t0 = performance.now();
      const step = (now: number) => {
        const k = ms <= 0 ? 1 : Math.min(1, (now - t0) / ms);
        const e = ease(k);
        apply({ s: Math.exp(Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * e), cu: from.cu + (to.cu - from.cu) * e, cv: from.cv + (to.cv - from.cv) * e });
        if (k < 1) raf.current = requestAnimationFrame(step);
        else done?.();
      };
      raf.current = requestAnimationFrame(step);
    },
    [apply, stop],
  );

  useImperativeHandle(
    ref,
    () => ({
      toggleZoom: () => {
        if (focusRef.current !== null) return;
        const g = geom.current;
        animateTo(outRef.current ? focusView(g) : overviewView(g), reduceMotion ? 0 : 520);
      },
    }),
    [animateTo, reduceMotion],
  );

  // First view, and a new geometry (the window changed): keep the same place on the wall.
  useEffect(() => {
    geom.current = geomFor(size.width, size.height);
    if (size.width === 0 || size.height === 0) return;
    const g = geom.current;
    if (focusRef.current !== null) apply(matchView(focusRef.current, g));
    else apply(view.current ? clampView(view.current, g) : focusView(g));
  }, [size.width, size.height, apply]);

  // A book was picked: zoom to the view the 3D camera will use. It was put back: return to looking around.
  const firstFocus = useRef(true);
  useEffect(() => {
    const first = firstFocus.current;
    firstFocus.current = false;
    const g = geom.current;
    if (g.vw === 0) return; // the size effect places the first view
    if (focusN !== null) {
      const target = matchView(focusN, g);
      if (first) apply(target); // opened straight from a link: already there
      else animateTo(target, reduceMotion ? 0 : 640, () => doneRef.current());
    } else if (!first) animateTo(focusView(g), reduceMotion ? 0 : 900);
  }, [focusN, animateTo, apply, reduceMotion]);

  useEffect(() => stop, [stop]);

  /* ---- dragging, pinching, wheel ---- */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: boolean; x: number; y: number; vx: number; vy: number; t: number; sx: number; sy: number } | null>(null);
  const pinch = useRef<{ d0: number; s0: number; pu: number; pv: number } | null>(null);

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const v = view.current;
      if (!v) return;
      const g = geom.current;
      apply(clampView({ ...v, cu: v.cu - dx / (g.W0 * v.s), cv: v.cv - dy / (g.H0 * v.s) }, g));
    },
    [apply],
  );

  const zoomAt = useCallback(
    (s: number, mx: number, my: number, pu: number, pv: number) => {
      const g = geom.current;
      const ns = Math.min(S_MAX, Math.max(sMin(g), s));
      apply(clampView({ s: ns, cu: pu - (mx - g.vw / 2) / (g.W0 * ns), cv: pv - (my - g.vh / 2) / (g.H0 * ns) }, g));
    },
    [apply],
  );

  const local = (e: { clientX: number; clientY: number }) => {
    const r = viewEl.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: RPointerEvent) => {
    if (busy || focusRef.current !== null) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stop();
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) drag.current = { moved: false, x: p.x, y: p.y, vx: 0, vy: 0, t: performance.now(), sx: p.x, sy: p.y };
    else if (pointers.current.size === 2 && view.current) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const g = geom.current;
      const v = view.current;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: v.s, pu: v.cu + (mx - g.vw / 2) / (g.W0 * v.s), pv: v.cv + (my - g.vh / 2) / (g.H0 * v.s) };
      if (drag.current) drag.current.moved = true;
    }
  };

  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const pc = pinch.current;
      zoomAt((pc.s0 * Math.hypot(a.x - b.x, a.y - b.y)) / pc.d0, (a.x + b.x) / 2, (a.y + b.y) / 2, pc.pu, pc.pv);
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > 6) {
      d.moved = true;
      viewEl.current?.setPointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.t);
    d.vx = d.vx * 0.6 + ((p.x - d.x) / dt) * 0.4;
    d.vy = d.vy * 0.6 + ((p.y - d.y) / dt) * 0.4;
    panBy(p.x - d.x, p.y - d.y);
    d.x = p.x;
    d.y = p.y;
    d.t = now;
  };

  const onPointerUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    if (pointers.current.size > 0 || !d) return;
    drag.current = null;
    if (!d.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    if (reduceMotion || performance.now() - d.t > 90) return;
    let vx = d.vx;
    let vy = d.vy;
    let last = performance.now();
    const glide = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      const f = Math.pow(0.94, dt / 16);
      vx *= f;
      vy *= f;
      panBy(vx * dt, vy * dt);
      if (Math.hypot(vx, vy) > 0.02) inertia.current = requestAnimationFrame(glide);
    };
    inertia.current = requestAnimationFrame(glide);
  };

  useEffect(() => {
    const el = viewEl.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (busy || focusRef.current !== null || !view.current) return;
      e.preventDefault();
      stop();
      const g = geom.current;
      const v = view.current;
      if (e.ctrlKey) {
        const p = local(e);
        const pu = v.cu + (p.x - g.vw / 2) / (g.W0 * v.s);
        const pv = v.cv + (p.y - g.vh / 2) / (g.H0 * v.s);
        zoomAt(v.s * Math.exp(-e.deltaY * 0.01), p.x, p.y, pu, pv);
      } else panBy(-e.deltaX, -e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [busy, stop, panBy, zoomAt]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 90;
    if (e.key === "ArrowLeft") panBy(step, 0);
    else if (e.key === "ArrowRight") panBy(-step, 0);
    else if (e.key === "ArrowUp") panBy(0, step);
    else if (e.key === "ArrowDown") panBy(0, -step);
    else return;
    e.preventDefault();
  };

  // Tabbing to a book brings it into view.
  const onFocusBook = (n: number) => {
    const v = view.current;
    if (!v || focusRef.current !== null) return;
    const g = geom.current;
    const b = layout.books[n]!;
    const x = g.vw / 2 + ((b.u0 + b.u1) / 2 - v.cu) * g.W0 * v.s;
    const y = g.vh / 2 + ((b.v0 + b.v1) / 2 - v.cv) * g.H0 * v.s;
    if (x > 40 && x < g.vw - 40 && y > 60 && y < g.vh - 60) return;
    animateTo(clampView({ ...v, cu: (b.u0 + b.u1) / 2, cv: (b.v0 + b.v1) / 2 }, g), reduceMotion ? 0 : 420);
  };

  /* ---- the fire ---- */
  const live = !paused && !reduceMotion;
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (live) void v.play().catch(() => undefined);
    else v.pause();
  }, [live, loaded]);

  // The flicker: a warm light that spills out of the fireplace and never repeats exactly.
  useEffect(() => {
    const el = flicker.current;
    if (!el || !live) return;
    let id = 0;
    const tick = (t: number) => {
      const s = t / 1000;
      const o = 0.74 + 0.1 * Math.sin(s * 5.3) + 0.07 * Math.sin(s * 11.7 + 1.3) + 0.05 * Math.sin(s * 23.1 + 0.4) + (Math.random() - 0.5) * 0.05;
      el.style.opacity = o.toFixed(3);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [live]);

  const patch = patchN !== null ? layout.patches[patchN] : null;
  const fire = layout.fire;
  const fireW = fire.u1 - fire.u0;
  const fireH = fire.v1 - fire.v0;
  // The footage is wider than the opening is tall; it sits on the hearth with the dark of the firebox above it.
  const spill = { u0: fire.u0 - fireW * 0.9, u1: fire.u1 + fireW * 0.9, v0: fire.v0 - fireH * 1.7, v1: fire.v1 + fireH * 0.5 };

  return (
    <div
      ref={viewEl}
      className="wall"
      data-hidden={paused}
      data-grab={focusN === null}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onKeyDown={onKeyDown}
    >
      <div ref={plate} className={`wall__plate${loaded ? " is-loaded" : ""}`}>
        <img
          ref={(el) => {
            plateImage.el = el;
          }}
          className="wall__img"
          src={asset("/assets/room/wall.webp")}
          alt=""
          draggable={false}
          decoding="async"
          onLoad={() => {
            setLoaded(true);
            onLoaded();
          }}
          onError={onFailed}
        />
        {patch && <img className="wall__patch" src={asset(`/assets/room/patch-${patchN}.webp`)} alt="" draggable={false} style={rectStyle(patch)} />}

        <div className="wall__fire" style={rectStyle(fire)} aria-hidden="true">
          {__HAS_FIRE_VIDEO__ && <span className="wall__dark" />}
          {__HAS_FIRE_VIDEO__ &&
            (reduceMotion ? (
              <img className="wall__flames" src={asset("/assets/room/fire-poster.jpg")} alt="" draggable={false} />
            ) : (
              <video ref={video} className="wall__flames" src={asset("/assets/room/fire.mp4")} poster={asset("/assets/room/fire-poster.jpg")} muted loop playsInline preload="auto" tabIndex={-1} />
            ))}
          <span className="wall__firebox" />
        </div>
        {__HAS_FIRE_VIDEO__ && <span ref={flicker} className="wall__spill" style={rectStyle(spill)} aria-hidden="true" />}

        {books.map((b, i) => {
          const r = layout.books[i]!;
          const state = b.locked ? "sealed" : b.highlight ? "newest" : "open";
          return (
            <span key={`g${i}`} className="wall__glow" data-state={state} data-hidden={patchN === i} style={{ ...rectStyle(r, 0.45), "--i": i } as CSSProperties} aria-hidden="true" />
          );
        })}
        {books.map((b, i) => {
          if (!b.band) return null;
          const r = layout.books[i]!;
          const w = r.u1 - r.u0;
          const h = r.v1 - r.v0;
          return (
            <span
              key={`b${i}`}
              className="wall__band"
              data-hidden={patchN === i}
              style={{ left: `${(r.u0 - w * 0.05) * 100}%`, top: `${(r.v0 + h * 0.3) * 100}%`, width: `${w * 1.1 * 100}%`, height: `${h * 0.24 * 100}%` }}
              aria-hidden="true"
            >
              <b>{b.band[0]}</b>
              <i>{b.band[1]}</i>
            </span>
          );
        })}

        <ul className="wall__books" inert={busy || focusN !== null}>
          {labels.map((label, i) => (
            <li key={i} style={rectStyle(layout.books[i]!)}>
              <button type="button" className="wall__book" aria-label={label} onFocus={() => onFocusBook(i)} onClick={() => onPick(i)} />
            </li>
          ))}
        </ul>
      </div>
      <span className="wall__vignette" aria-hidden="true" />
    </div>
  );
});
