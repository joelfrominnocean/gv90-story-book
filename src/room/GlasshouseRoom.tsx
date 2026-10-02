import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import type { ShelfBookSpec } from "../book3d/shelf";
import { content, ui } from "../content";
import { asset } from "../content/asset";
import "../styles/room.css";
import { GlassRain } from "./GlassRain";
import manifestJson from "./glasshouse.manifest.json";
import { paletteFor } from "./palette";
import { POSTER_H, POSTER_W, PosterFace, quadMatrix } from "./PosterFace";
import { RoomAudio, tracks } from "./roomAudio";
import type { RoomHandle } from "./ListeningRoom";

/**
 * The listening room as layers. Every object in it is its own transparent image with an id, a box on the frame, a depth, and a hit
 * area, all listed in glasshouse.manifest.json, so an illustrator's art can replace any one of them by dropping in a file of
 * the same box: nothing here knows what is in the pictures. The folding screen's six panels are drawn from data (a poster
 * if the chapter has arrived, a dark frame with a brass date plate if not), the turntable's platter turns and its tonearm
 * swings, and the rain is a light layer of its own, masked to the glass so that it never falls on furniture.
 */
type Box = [number, number, number, number];
interface Layer {
  id: string;
  src: string;
  box: Box;
  par: number;
  z: number;
  kind: "sky" | "floor" | "object" | "mask" | "frame" | "platter" | "arm";
  state?: "late" | "dusk" | "night";
  interact?: "jar" | "sleeve" | "tale";
  hit?: Box | null;
  pivot?: [number, number];
}
interface Manifest {
  aspect: number;
  layers: Layer[];
  posters: { n: number; quad: [number, number][] }[];
  tt: { squash?: number; armPlay?: number; armRest?: number };
  lamp: { u: number; v: number };
  home: { u: number; v: number };
  /** Places the opening pan visits and that words appear near (fractions of the frame). */
  focus?: Record<"book" | "record" | "screen" | "jar" | "moon", { u: number; v: number }>;
}
const MAN = manifestJson as unknown as Manifest;

interface Props {
  size: { width: number; height: number };
  books: ShelfBookSpec[];
  labels: string[];
  busy: boolean;
  focusN: number | null;
  paused: boolean;
  reduceMotion: boolean;
  onPick: (n: number) => void;
  onFocused: () => void;
  onLoaded: () => void;
  onSoundChange: (on: boolean) => void;
  onOpenTale: () => void;
}

const SEEN_KEY = "gv90.room.seen";
const TALE_KEY = "gv90.room.tale";
const TOUR_KEY = "gv90.room.tour";
const load = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const save = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode: it just comes back next time */
  }
};
const loadSeen = (): number[] => {
  try {
    const v = JSON.parse(load(SEEN_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
};

const ARM_REST = MAN.tt.armRest ?? 82;
const ARM_PLAY = MAN.tt.armPlay ?? 131;
const SQUASH = MAN.tt.squash ?? 0.59;
const DEG_PER_SEC = 200; // 33 1/3 rpm

const boxStyle = (b: Box): CSSProperties => ({ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${(b[2] - b[0]) * 100}%`, height: `${(b[3] - b[1]) * 100}%` });
/** A box inside another box, as percentages of the outer one. */
const inside = (hit: Box, outer: Box): CSSProperties => {
  const w = outer[2] - outer[0];
  const h = outer[3] - outer[1];
  return { left: `${((hit[0] - outer[0]) / w) * 100}%`, top: `${((hit[1] - outer[1]) / h) * 100}%`, width: `${((hit[2] - hit[0]) / w) * 100}%`, height: `${((hit[3] - hit[1]) / h) * 100}%` };
};
const union = (...bs: (Box | undefined | null)[]): Box | null => {
  const v = bs.filter((b): b is Box => !!b);
  if (!v.length) return null;
  return [Math.min(...v.map((b) => b[0])), Math.min(...v.map((b) => b[1])), Math.max(...v.map((b) => b[2])), Math.max(...v.map((b) => b[3]))];
};

export const GlasshouseRoom = forwardRef<RoomHandle, Props>(function GlasshouseRoom(
  { size, books, labels, busy, focusN, paused, reduceMotion, onPick, onFocused, onLoaded, onSoundChange, onOpenTale },
  ref,
) {
  const sceneEl = useRef<HTMLDivElement>(null);
  const flashEl = useRef<HTMLDivElement>(null);
  const platterImg = useRef<HTMLImageElement>(null);
  const audio = useRef<RoomAudio | null>(null);
  const geom = useRef({ vw: 0, vh: 0, sceneW: 0 });
  const xRef = useRef<number | null>(null);
  const par = useRef<[HTMLElement, number][]>([]);
  const raf = useRef(0);
  const inertia = useRef(0);
  const suppress = useRef(false);
  const doneRef = useRef(onFocused);
  doneRef.current = onFocused;
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState(0);
  const [shimmer, setShimmer] = useState(0);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [seen, setSeen] = useState<number[]>(loadSeen);
  const [taleSeen, setTaleSeen] = useState(() => load(TALE_KEY) === "1");

  const sceneH = Math.max(size.height, size.width / MAN.aspect);
  const sceneW = sceneH * MAN.aspect;
  const open = books.filter((b) => !b.locked).length;
  const pal = paletteFor(open, books.length);
  const live = !paused && visible;
  const byId = useMemo(() => new Map(MAN.layers.map((l) => [l.id, l])), []);
  const glass = byId.get("glassmask");

  // How far into the evening the room is: the sky crossfades between three plates as more chapters arrive.
  const t = Math.min(1, Math.max(0, (open - 1) / Math.max(1, books.length - 1)));
  // The afternoon sky is always there; dusk fades in over it as the evening comes on, and night over that. (Fading all three at once would let the dark behind show through.)
  const skyWeight = { late: 1, dusk: Math.min(1, 2 * t), night: Math.max(0, 2 * t - 1) };

  const ensure = useCallback((): RoomAudio => {
    if (!audio.current) {
      const a = new RoomAudio();
      a.onTrack = (_t, i) => setTrack(i);
      a.onPlaying = (p) => setPlaying(p);
      audio.current = a;
    }
    return audio.current;
  }, []);

  /* ---- words only when you come near: the screen and the book each say one quiet thing as the view arrives, then go ---- */
  const [cap, setCap] = useState<"screen" | "tale" | null>(null);
  const nearRef = useRef<"screen" | "tale" | null>(null);
  const capTimer = useRef(0);
  const armed = useRef(false);
  const checkNear = useCallback((x: number) => {
    const F = MAN.focus;
    const g = geom.current;
    if (!F || !g.sceneW) return;
    const centre = (g.vw / 2 - x) / g.sceneW; // the fraction of the scene that is in the middle of the screen
    const r = Math.max(70, g.vw * 0.2);
    const dist = (u: number) => Math.abs(centre - u) * g.sceneW;
    const next = dist(F.screen.u) < r ? "screen" : dist(F.book.u) < r ? "tale" : null;
    if (next === nearRef.current) return;
    nearRef.current = next;
    window.clearTimeout(capTimer.current);
    if (!next || !armed.current) return setCap(null);
    setCap(next);
    capTimer.current = window.setTimeout(() => setCap(null), 3800); // it is said once per visit, not left up
  }, []);
  useEffect(() => {
    // not while the title card is still on screen; then whatever is in the middle gets its moment
    const id = window.setTimeout(() => {
      armed.current = true;
      nearRef.current = null;
      checkNear(xRef.current ?? 0);
    }, 5200);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(capTimer.current);
    };
  }, [checkNear]);

  /* ---- looking around, with depth ---- */
  const apply = useCallback((x: number) => {
    const g = geom.current;
    const clamped = Math.min(0, Math.max(g.vw - g.sceneW, x));
    xRef.current = clamped;
    checkNear(clamped);
    if (sceneEl.current) sceneEl.current.style.transform = `translate3d(${clamped}px,0,0)`;
    // A layer with a depth of less than 1 keeps less of the scene's movement than the room does, so it seems far away.
    const cx = g.vw / 2 - clamped;
    const home = MAN.home.u * g.sceneW;
    for (const [el, p] of par.current) el.style.transform = `translate3d(${((1 - p) * (cx - home)).toFixed(1)}px,0,0)`;
  }, [checkNear]);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    cancelAnimationFrame(inertia.current);
  }, []);

  useEffect(() => {
    par.current = [...(sceneEl.current?.querySelectorAll<HTMLElement>("[data-par]") ?? [])].map((el) => [el, Number(el.dataset.par)]).filter(([, p]) => p !== 1) as [HTMLElement, number][];
    if (xRef.current !== null) apply(xRef.current);
  });

  useEffect(() => {
    geom.current = { vw: size.width, vh: size.height, sceneW };
    if (size.width === 0 || size.height === 0) return;
    const home = size.width / 2 - MAN.home.u * sceneW;
    if (xRef.current === null) {
      if (reduceMotion) return apply(home);
      const from = home + 130;
      apply(from);
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 2800);
        apply(from + (home - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    } else apply(xRef.current);
  }, [size.width, size.height, sceneW, reduceMotion, apply]);
  useEffect(() => stop, [stop]);

  const drag = useRef<{ x: number; sx: number; vx: number; t: number; moved: boolean; id: number } | null>(null);
  const onPointerDown = (e: RPointerEvent) => {
    tourStop.current?.();
    if (busy || focusN !== null) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stop();
    drag.current = { x: e.clientX, sx: e.clientX, vx: 0, t: performance.now(), moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.sx) > 6) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    const now = performance.now();
    d.vx = d.vx * 0.6 + ((e.clientX - d.x) / Math.max(1, now - d.t)) * 0.4;
    apply((xRef.current ?? 0) + (e.clientX - d.x));
    d.x = e.clientX;
    d.t = now;
  };
  const onPointerUp = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    suppress.current = true;
    window.setTimeout(() => (suppress.current = false), 0);
    if (reduceMotion || performance.now() - d.t > 90) return;
    let vx = d.vx;
    let last = performance.now();
    const glide = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      vx *= Math.pow(0.94, dt / 16);
      apply((xRef.current ?? 0) + vx * dt);
      if (Math.abs(vx) > 0.02) inertia.current = requestAnimationFrame(glide);
    };
    inertia.current = requestAnimationFrame(glide);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    tourStop.current?.();
    if (e.key === "ArrowLeft") apply((xRef.current ?? 0) + 120);
    else if (e.key === "ArrowRight") apply((xRef.current ?? 0) - 120);
    else return;
    e.preventDefault();
  };

  /* ---- the platter turns up to speed and coasts to a stop ---- */
  const spin = useRef({ angle: 0, vel: 0, target: 0, loop: 0, last: 0 });
  useEffect(() => {
    const s = spin.current;
    s.target = playing ? DEG_PER_SEC : 0;
    if (s.loop) return;
    s.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;
      const tau = s.target > s.vel ? 0.8 : 1.6;
      s.vel += (s.target - s.vel) * (1 - Math.exp(-dt / tau));
      s.angle = (s.angle + s.vel * dt) % 360;
      if (platterImg.current) platterImg.current.style.transform = `rotate(${s.angle.toFixed(2)}deg)`;
      s.loop = s.vel > 0.4 || s.target > 0 ? requestAnimationFrame(step) : 0;
    };
    s.loop = requestAnimationFrame(step);
  }, [playing]);
  useEffect(
    () => () => {
      cancelAnimationFrame(spin.current.loop);
      spin.current.loop = 0; // or a remount (React does one in development) would think the loop is still running
    },
    [],
  );

  /* ---- the things you can touch ---- */
  const onTurntable = () => {
    const a = ensure();
    a.unlock(); // inside the tap: this is what lets the browser play sound
    if (playing) {
      a.stopRecord();
      setPlaying(false);
    } else {
      a.playRecord();
      setPlaying(true);
      onSoundChange(true);
    }
  };
  const onSleeve = () => {
    const a = ensure();
    a.unlock();
    setTrack((a.index + 1) % Math.max(1, tracks.length));
    if (playing) {
      setPlaying(false);
      a.next();
      window.setTimeout(() => setPlaying(true), 1250);
    } else {
      a.playRecord(a.index + 1);
      setPlaying(true);
      onSoundChange(true);
    }
  };
  // The jar only rings. It never starts the rain or a record and never touches the Sound switch: records come from the turntable.
  const onJar = () => {
    const a = ensure();
    a.unlock();
    a.ring();
    setShimmer((n) => n + 1);
  };
  const onTale = () => {
    setTaleSeen(true);
    save(TALE_KEY, "1");
    onOpenTale();
  };
  const markSeen = (n: number) =>
    setSeen((s) => {
      if (s.includes(n)) return s;
      const next = [...s, n];
      save(SEEN_KEY, JSON.stringify(next));
      return next;
    });

  useImperativeHandle(
    ref,
    () => ({
      pageTurn: () => audio.current?.pageTurn(),
      toggleSound: () => {
        const a = ensure();
        a.unlock();
        const on = !a.soundOn;
        a.setSound(on);
        if (!on && a.playing) {
          a.stopRecord();
          setPlaying(false);
        }
        onSoundChange(on);
      },
    }),
    [ensure, onSoundChange],
  );

  /* ---- the opening pan: once, without a word, the view drifts to the folding screen, then to the book, then home ---- */
  const tourStop = useRef<(() => void) | null>(null);
  useEffect(() => {
    const F = MAN.focus;
    if (!F || reduceMotion || focusN !== null || busy || !live) return;
    const flag = new URLSearchParams(window.location.search).get("tour"); // ?tour=1 plays it again, ?tour=0 never
    if (flag === "0" || (flag === null && load(TOUR_KEY) === "1")) return;
    let cancelled = false;
    let raf = 0;
    let timer = 0;
    const wait = (ms: number) => new Promise<void>((res) => (timer = window.setTimeout(res, ms)));
    const glide = (toU: number, ms: number) =>
      new Promise<void>((res) => {
        const from = xRef.current ?? 0;
        const to = geom.current.vw / 2 - toU * geom.current.sceneW;
        const t0 = performance.now();
        const stepFn = (now: number) => {
          if (cancelled) return res();
          const k = Math.min(1, (now - t0) / ms);
          apply(from + (to - from) * (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2));
          if (k < 1) raf = requestAnimationFrame(stepFn);
          else res();
        };
        raf = requestAnimationFrame(stepFn);
      });
    const run = async () => {
      await wait(4200);
      if (cancelled) return;
      await glide(F.screen.u, 2200);
      await wait(3900);
      if (cancelled) return;
      await glide(F.book.u, 2200);
      await wait(3900);
      if (cancelled) return;
      await glide(MAN.home.u, 2200);
      save(TOUR_KEY, "1");
    };
    void run();
    tourStop.current = () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      save(TOUR_KEY, "1"); // you took the controls: it will not be offered again
      tourStop.current = null;
    };
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      tourStop.current = null;
    };
  }, [reduceMotion, focusN, busy, live, apply]);

  /* ---- opening a chapter: the room dims, the sound steps back, then the book comes ---- */
  useEffect(() => {
    audio.current?.duck(focusN !== null);
    if (focusN === null) return;
    const timer = window.setTimeout(() => doneRef.current(), reduceMotion ? 0 : 520);
    return () => window.clearTimeout(timer);
  }, [focusN, reduceMotion]);

  /* ---- keeping it cheap while it is left open ---- */
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    // The room is ready once its pictures are: the first frame of the frame layer, or a short wait if there is none.
    const id = requestAnimationFrame(onLoaded);
    return () => cancelAnimationFrame(id);
  }, [onLoaded]);
  useEffect(() => () => audio.current?.dispose(), []);

  /* ---- weather ---- */
  const flash = useCallback(() => {
    const el = flashEl.current;
    if (!el) return;
    el.classList.remove("is-on");
    void el.offsetWidth;
    el.classList.add("is-on");
    const sc = sceneEl.current;
    sc?.classList.add("is-lit");
    window.setTimeout(() => sc?.classList.remove("is-lit"), 170);
    audio.current?.thunder();
  }, []);
  useEffect(() => {
    if (reduceMotion || !live) return;
    let timer = 0;
    const again = () => {
      flash();
      timer = window.setTimeout(again, 45000 + Math.random() * 65000);
    };
    timer = window.setTimeout(again, 16000 + Math.random() * 12000);
    return () => window.clearTimeout(timer);
  }, [live, reduceMotion, flash]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__room = {
      flash,
      /** Dev only: put the fraction u (0..1) of the scene's width in the middle of the screen. */
      panTo: (u: number) => apply(geom.current.vw / 2 - u * geom.current.sceneW),
      get audio() {
        return audio.current;
      },
    };
  }, [flash, apply]);

  const tt = { base: byId.get("tt_base"), platter: byId.get("tt_platter"), arm: byId.get("tt_arm") };
  // The turntable's tap target is the platter and the tonearm as they are drawn (the page squashes both, so the box is squashed too),
  // with a little room round them: never the whole sprite, which is larger than the deck and overlaps what stands beside it.
  const ttHit = (() => {
    const flat = (b?: Box): Box | null => {
      if (!b) return null;
      const cy = (b[1] + b[3]) / 2;
      const hh = ((b[3] - b[1]) / 2) * SQUASH;
      return [b[0], cy - hh, b[2], cy + hh];
    };
    const u = union(flat(tt.platter?.box), flat(tt.arm?.box));
    if (!u) return null;
    const padX = (u[2] - u[0]) * 0.08;
    const padY = (u[3] - u[1]) * 0.18;
    return [u[0] - padX, u[1] - padY, u[2] + padX, u[3] + padY] as Box;
  })();
  const inert = busy || focusN !== null;
  const vars = { "--lamp": pal.lamp, "--night": pal.night } as CSSProperties;
  const px = (b: Box) => ({ w: (b[2] - b[0]) * sceneW, h: (b[3] - b[1]) * sceneH });

  return (
    <div
      className="room gh"
      data-paused={!live}
      style={vars}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onScroll={(e) => {
        e.currentTarget.scrollLeft = 0;
        e.currentTarget.scrollTop = 0;
      }}
      onClickCapture={(e) => suppress.current && (e.stopPropagation(), e.preventDefault())}
    >
      <div ref={sceneEl} className="room__scene" style={{ width: sceneW, height: sceneH }}>
        {MAN.layers.map((l) => {
          if (l.kind === "mask") return null; // the glass mask is not drawn: it only shapes the rain
          if (l.kind === "platter") {
            const { w, h } = px(l.box);
            return (
              <div key={l.id} className="gh__layer" style={{ ...boxStyle(l.box), zIndex: l.z, transform: `scaleY(${SQUASH})` }}>
                <img ref={platterImg} src={asset(l.src)} alt="" draggable={false} style={{ width: w, height: h }} />
              </div>
            );
          }
          if (l.kind === "arm") {
            const { w, h } = px(l.box);
            const pv = l.pivot ?? [0.1, 0.5];
            return (
              <div key={l.id} className="gh__layer" style={{ left: `${(l.box[0] + pv[0] * (l.box[2] - l.box[0])) * 100}%`, top: `${(l.box[1] + pv[1] * (l.box[3] - l.box[1])) * 100}%`, width: 0, height: 0, zIndex: l.z, transform: `scaleY(${SQUASH})` }}>
                <img
                  src={asset(l.src)}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    left: -pv[0] * w,
                    top: -pv[1] * h,
                    width: w,
                    height: h,
                    maxWidth: "none",
                    transformOrigin: `${pv[0] * w}px ${pv[1] * h}px`,
                    transform: `rotate(${playing ? ARM_PLAY : ARM_REST}deg)`,
                    transition: reduceMotion ? "none" : "transform 1.35s cubic-bezier(0.45, 0.05, 0.25, 1)",
                  }}
                />
              </div>
            );
          }
          const style: CSSProperties = { ...boxStyle(l.box), zIndex: l.z };
          if (l.kind === "sky") style.opacity = skyWeight[l.state ?? "dusk"];
          const label = l.interact === "jar" ? ui("roomJar").text : l.interact === "sleeve" ? ui("roomNextRecord").text : l.interact === "tale" ? content.meta.tale?.title.text : null;
          return (
            <div key={l.id} className={`gh__layer gh__${l.kind}`} data-par={l.par} data-id={l.id} style={style}>
              <img src={asset(l.src)} alt="" draggable={false} />
              {l.interact === "jar" && shimmer > 0 && <span key={shimmer} className="gh__shimmer" style={{ WebkitMaskImage: `url(${asset(l.src)})`, maskImage: `url(${asset(l.src)})` }} aria-hidden="true" />}
              {(l.interact === "jar" || l.interact === "sleeve" || l.interact === "tale") && l.hit && (
                <button
                  type="button"
                  className="room__btn gh__hit"
                  style={inside(l.hit, l.box)}
                  aria-label={label ?? ""}
                  inert={inert}
                  onClick={l.interact === "jar" ? onJar : l.interact === "sleeve" ? onSleeve : onTale}
                />
              )}
            </div>
          );
        })}

        {/* the turntable's one tap target: the base and the platter together */}
        {ttHit && (
          <div className="gh__layer" style={{ ...boxStyle(ttHit), zIndex: 21 }}>
            <button type="button" className="room__btn room__btn--hint gh__hit" data-playing={playing} style={{ inset: 0, width: "100%", height: "100%" }} inert={inert} aria-label={(playing ? ui("roomPause") : ui("roomPlay")).text ?? ""} aria-pressed={playing} onClick={onTurntable} />
          </div>
        )}

        {/* the folding screen's six panels, drawn from data and warped onto each panel's four corners */}
        <div className="gh__layer gh__posters" style={{ left: 0, top: 0, width: "100%", height: "100%", zIndex: 15 }}>
          {MAN.posters.map(({ n, quad }) => {
            const spec = books[n];
            if (!spec) return null;
            const q = quad.map(([u, v]) => [u * sceneW, v * sceneH]) as [number, number][];
            const xs = q.map((p) => p[0]);
            const ys = q.map((p) => p[1]);
            const bx = Math.min(...xs);
            const by = Math.min(...ys);
            return (
              <div key={n}>
                <div className="gh__poster" style={{ width: POSTER_W, height: POSTER_H, transform: quadMatrix(POSTER_W, POSTER_H, q) }}>
                  <PosterFace n={n} spec={spec} />
                </div>
                {!spec.locked && !seen.includes(n) && <span className="gh__pglow" style={{ left: bx - 14, top: by - 14, width: Math.max(...xs) - bx + 28, height: Math.max(...ys) - by + 28 }} aria-hidden="true" />}
                <button
                  type="button"
                  className="room__btn gh__poster-hit"
                  style={{ left: bx, top: by, width: Math.max(...xs) - bx, height: Math.max(...ys) - by }}
                  aria-label={labels[n]}
                  inert={inert}
                  onClick={() => {
                    markSeen(n);
                    onPick(n);
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* weather, only where there is glass (the mask is the glass you can actually see): rain, a sheen of reflected light, and the lightning */}
        {glass && (
          <div className="gh__glassmask" style={{ ...boxStyle(glass.box), zIndex: 51, WebkitMaskImage: `url(${asset(glass.src)})`, maskImage: `url(${asset(glass.src)})` }} aria-hidden="true">
            <div className="gh__smoke" />
            <GlassRain width={px(glass.box).w} height={px(glass.box).h} active={live && !reduceMotion} />
            <div ref={flashEl} className="room__flash" />
          </div>
        )}
        <div className="gh__night" aria-hidden="true" />
        <div className="gh__lamp" style={{ left: `${MAN.lamp.u * 100}%`, top: `${MAN.lamp.v * 100}%`, "--boost": playing ? 1 : 0 } as CSSProperties} aria-hidden="true" />
        {!taleSeen && byId.get("book")?.hit && <span className="gh__taleglow" style={boxStyle(byId.get("book")!.hit!)} aria-hidden="true" />}
        <span hidden data-track={track} />
      </div>
      <span className="room__vignette" aria-hidden="true" />
      {/* one slot for words, so that nothing can overlap: what you have come near (one at a time), and the record that is playing */}
      <div className="gh__caps" aria-live="polite">
        <p className="gh__cap" data-on={cap === "screen" && !inert}>
          {ui("roomCapChaptersSub").text}
        </p>
        <p className="gh__cap gh__cap--tale" data-on={cap === "tale" && !inert}>
          <em>{content.meta.tale?.title.text}</em>
          <span>{ui("roomCapTaleSub").text}</span>
        </p>
        <p className="gh__now" data-on={playing && !inert}>
          {tracks[track]?.title}
        </p>
      </div>
      <span className="room__dim" data-on={focusN !== null} aria-hidden="true" />
    </div>
  );
});
