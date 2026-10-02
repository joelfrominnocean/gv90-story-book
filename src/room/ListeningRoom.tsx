import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import type { ShelfBookSpec } from "../book3d/shelf";
import { content, ui } from "../content";
import "../styles/room.css";
import { paletteFor } from "./palette";
import { RainGlass } from "./RainGlass";
import { CityLayers, HOT, LAMP, SCENE_H, SCENE_W, TURNTABLE_BOX, WIN, WallArt, pct, posterRect, type Rect } from "./RoomArt";
import { RoomAudio, tracks } from "./roomAudio";
import { Turntable } from "./Turntable";

export interface RoomHandle {
  /** The sound switch in the corner: the whole room on or off. */
  toggleSound: () => void;
  /** The sound of a page turning (the folk tale calls it). */
  pageTurn: () => void;
}

interface Props {
  /** Size of the book area in CSS px. */
  size: { width: number; height: number };
  books: ShelfBookSpec[];
  /** One accessible name per poster. */
  labels: string[];
  busy: boolean;
  /** The chapter being opened: the room dims, then `onFocused`, then the book comes. */
  focusN: number | null;
  /** A book is down and covers the room: stop drawing it. */
  paused: boolean;
  reduceMotion: boolean;
  onPick: (n: number) => void;
  onFocused: () => void;
  onLoaded: () => void;
  onSoundChange: (on: boolean) => void;
  /** The open book on the credenza was picked: the folk tale. */
  onOpenTale: () => void;
}

const SEEN_KEY = "gv90.room.seen";
const TALE_KEY = "gv90.room.tale";
const loadSeen = (): number[] => {
  try {
    const v = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
};

/** Where the middle of the window is: the view opens here, with the turntable in front of it. */
const HOME_X = 1010;

/**
 * The listening room: a rainy night in a private listening room, wider than the screen. Drag to look along it. Tap the
 * turntable and the needle comes down and the music starts (that tap is also what lets the browser play sound at all);
 * tap the sleeve beside it for another record; tap the moon jar and it rings. The six frames on the wall are the chapters:
 * an open chapter is a poster, one that has not arrived is an empty frame with a brass plate showing its date.
 *
 * It is the same size of idea as the library wall it replaces and takes the same props, so the book can still come down
 * from it, but nothing here is a finished asset: the art is a scamp, the music is a stand-in, the rain is synthesised.
 */
export const ListeningRoom = forwardRef<RoomHandle, Props>(function ListeningRoom(
  { size, books, labels, busy, focusN, paused, reduceMotion, onPick, onFocused, onLoaded, onSoundChange, onOpenTale },
  ref,
) {
  const sceneEl = useRef<HTMLDivElement>(null);
  const cityEl = useRef<SVGSVGElement>(null);
  const flashEl = useRef<HTMLDivElement>(null);
  const audio = useRef<RoomAudio | null>(null);
  const geom = useRef({ vw: 0, vh: 0, sceneW: 0, scale: 1 });
  const xRef = useRef<number | null>(null);
  const layers = useRef<[SVGGElement, number][]>([]);
  const raf = useRef(0);
  const inertia = useRef(0);
  const suppress = useRef(false);
  const doneRef = useRef(onFocused);
  doneRef.current = onFocused;
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState(0);
  const [ripple, setRipple] = useState(0);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [seen, setSeen] = useState<number[]>(loadSeen);
  const [taleSeen, setTaleSeen] = useState(() => {
    try {
      return window.localStorage.getItem(TALE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const sceneH = Math.max(size.height, size.width / (SCENE_W / SCENE_H));
  const scale = sceneH / SCENE_H;
  const sceneW = SCENE_W * scale;
  const open = books.filter((b) => !b.locked).length;
  const pal = paletteFor(open, books.length);
  const live = !paused && visible;

  const ensure = useCallback((): RoomAudio => {
    if (!audio.current) {
      const a = new RoomAudio();
      a.onTrack = (_t, i) => setTrack(i);
      a.onPlaying = (p) => setPlaying(p);
      audio.current = a;
    }
    return audio.current;
  }, []);

  /* ---- looking around ---- */
  const apply = useCallback((x: number) => {
    const g = geom.current;
    const clamped = Math.min(0, Math.max(g.vw - g.sceneW, x));
    xRef.current = clamped;
    if (sceneEl.current) sceneEl.current.style.transform = `translate3d(${clamped}px,0,0)`;
    // The far layers of the city keep less of the scene's movement than the near ones: that is what makes the window deep.
    const cx = (g.vw / 2 - clamped) / g.scale;
    for (const [el, k] of layers.current) el.style.transform = `translateX(${((1 - k) * (cx - HOME_X)).toFixed(1)}px)`;
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    cancelAnimationFrame(inertia.current);
  }, []);

  useEffect(() => {
    layers.current = [...(cityEl.current?.querySelectorAll<SVGGElement>("[data-par]") ?? [])].map((el) => [el, Number(el.dataset.par)]);
  }, []);

  useEffect(() => {
    geom.current = { vw: size.width, vh: size.height, sceneW, scale };
    if (size.width === 0 || size.height === 0) return;
    const home = size.width / 2 - HOME_X * scale;
    if (xRef.current === null) {
      // The first look: the room settles into place, drifting a little, which also says that it can be moved.
      if (reduceMotion) return apply(home);
      const from = home + 150 * scale;
      apply(from);
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 2800);
        apply(from + (home - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    } else apply(xRef.current);
  }, [size.width, size.height, sceneW, scale, reduceMotion, apply]);

  useEffect(() => stop, [stop]);

  const drag = useRef<{ x: number; sx: number; vx: number; t: number; moved: boolean; id: number } | null>(null);
  const onPointerDown = (e: RPointerEvent) => {
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
    const dt = Math.max(1, now - d.t);
    d.vx = d.vx * 0.6 + ((e.clientX - d.x) / dt) * 0.4;
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
    if (e.key === "ArrowLeft") apply((xRef.current ?? 0) + 120);
    else if (e.key === "ArrowRight") apply((xRef.current ?? 0) - 120);
    else return;
    e.preventDefault();
  };

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
      // The arm lifts, the platter slows, a gap of crackle, and the needle comes down on the next one.
      setPlaying(false);
      a.next();
      window.setTimeout(() => setPlaying(true), 1250);
    } else {
      a.playRecord(a.index + 1);
      setPlaying(true);
      onSoundChange(true);
    }
  };
  const onJar = () => {
    const a = ensure();
    a.unlock();
    if (!a.soundOn) {
      a.setSound(true);
      onSoundChange(true);
    }
    a.ring();
    setRipple((r) => r + 1);
  };
  const markSeen = (n: number) => {
    setSeen((s) => {
      if (s.includes(n)) return s;
      const next = [...s, n];
      try {
        window.localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        /* private mode: the highlight just comes back next time */
      }
      return next;
    });
  };

  const onTale = () => {
    setTaleSeen(true);
    try {
      window.localStorage.setItem(TALE_KEY, "1");
    } catch {
      /* private mode: the glow just comes back next time */
    }
    onOpenTale();
  };

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

  /* ---- opening a chapter: the room dims, the sound steps back, then the book comes ---- */
  useEffect(() => {
    audio.current?.duck(focusN !== null);
    if (focusN === null) return;
    const t = window.setTimeout(() => doneRef.current(), reduceMotion ? 0 : 520);
    return () => window.clearTimeout(t);
  }, [focusN, reduceMotion]);

  /* ---- keeping it cheap while it is left open ---- */
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  useEffect(() => {
    const id = requestAnimationFrame(onLoaded);
    return () => cancelAnimationFrame(id);
  }, [onLoaded]);
  useEffect(() => () => audio.current?.dispose(), []);

  /* ---- weather and the city ---- */
  const flash = useCallback(() => {
    const el = flashEl.current;
    if (!el) return;
    el.classList.remove("is-on");
    void el.offsetWidth;
    el.classList.add("is-on");
    const city = cityEl.current;
    city?.classList.add("is-lit");
    window.setTimeout(() => city?.classList.remove("is-lit"), 170);
    audio.current?.thunder();
  }, []);
  useEffect(() => {
    if (reduceMotion || !live) return;
    // Rare, so it stays a moment and not a habit: the first after a while, then every minute or two.
    let t = 0;
    const again = () => {
      flash();
      t = window.setTimeout(again, 45000 + Math.random() * 65000);
    };
    t = window.setTimeout(again, 16000 + Math.random() * 12000);
    return () => window.clearTimeout(t);
  }, [live, reduceMotion, flash]);
  useEffect(() => {
    if (reduceMotion || !live) return;
    // A window somewhere in the city goes dark or lights up, every few seconds. One change at a time keeps the repaint tiny.
    const wins = [...(cityEl.current?.querySelectorAll<SVGRectElement>(".room-win") ?? [])];
    let t = 0;
    const tick = () => {
      const w = wins[Math.floor(Math.random() * wins.length)];
      if (w) w.style.opacity = w.style.opacity === "0.08" ? "" : "0.08";
      t = window.setTimeout(tick, 1400 + Math.random() * 3600);
    };
    t = window.setTimeout(tick, 2000);
    return () => window.clearTimeout(t);
  }, [live, reduceMotion]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__room = {
      flash,
      /** Dev only: put scene x (0..2000) in the middle of the screen. */
      panTo: (cx: number) => apply(geom.current.vw / 2 - cx * geom.current.scale),
      get audio() {
        return audio.current;
      },
    };
  }, [flash, apply]);

  const vars = {
    "--sky-top": pal.skyTop,
    "--sky-bottom": pal.skyBottom,
    "--far": pal.far,
    "--mid": pal.mid,
    "--near": pal.near,
    "--moon": pal.moon,
    "--night": pal.night,
    "--lamp": pal.lamp,
  } as CSSProperties;
  const lampBox: Rect = { x: LAMP.x - 330, y: LAMP.y - 330, w: 660, h: 660 };
  const jarBox = HOT.jar;
  const inert = busy || focusN !== null;

  return (
    <div className="room" data-paused={!live} style={vars} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown} onClickCapture={(e) => suppress.current && (e.stopPropagation(), e.preventDefault())}>
      <div ref={sceneEl} className="room__scene" style={{ width: sceneW, height: sceneH }}>
        <CityLayers svgRef={cityEl} />
        <div className="room__glass" style={pct(WIN)} aria-hidden="true">
          <RainGlass width={WIN.w * scale} height={WIN.h * scale} active={live && !reduceMotion} />
          <div ref={flashEl} className="room__flash" />
        </div>
        <WallArt books={books} />
        <div className="room__turntable" style={pct(TURNTABLE_BOX)} aria-hidden="true">
          <Turntable playing={playing} track={track} reduceMotion={reduceMotion} />
        </div>
        <div className="room__night" aria-hidden="true" />
        <div className="room__lamp" style={{ ...pct(lampBox), "--boost": playing ? 1 : 0 } as CSSProperties} aria-hidden="true" />
        {ripple > 0 && <span key={ripple} className="room__ripple" style={pct({ x: jarBox.x + 30, y: jarBox.y + 40, w: jarBox.w - 60, h: jarBox.h - 50 })} aria-hidden="true" />}
        {!taleSeen && <span className="room__taleglow" style={pct({ x: HOT.tale.x - 30, y: HOT.tale.y - 24, w: HOT.tale.w + 60, h: HOT.tale.h + 50 })} aria-hidden="true" />}
        {books.map((b, i) =>
          !b.locked && !seen.includes(i) ? <span key={`g${i}`} className="room__pglow" style={pct(posterRect(i), 0.22)} aria-hidden="true" /> : null,
        )}

        <ul className="room__hot" inert={inert}>
          <li style={pct(HOT.turntable)}>
            <button type="button" className="room__btn room__btn--hint" data-playing={playing} aria-label={(playing ? ui("roomPause") : ui("roomPlay")).text ?? ""} aria-pressed={playing} onClick={onTurntable} />
          </li>
          <li style={pct(HOT.sleeve)}>
            <button type="button" className="room__btn" aria-label={ui("roomNextRecord").text ?? ""} onClick={onSleeve} />
          </li>
          <li style={pct(HOT.tale)}>
            <button type="button" className="room__btn" aria-label={content.meta.tale?.title.text ?? ""} onClick={onTale} />
          </li>
          <li style={pct(HOT.jar)}>
            <button type="button" className="room__btn" aria-label={ui("roomJar").text ?? ""} onClick={onJar} />
          </li>
          {books.map((_, i) => (
            <li key={i} style={pct(posterRect(i), 0.07)}>
              <button
                type="button"
                className="room__btn"
                aria-label={labels[i]}
                onClick={() => {
                  markSeen(i);
                  onPick(i);
                }}
              />
            </li>
          ))}
        </ul>
      </div>
      <span className="room__vignette" aria-hidden="true" />
      <span className="room__dim" data-on={focusN !== null} aria-hidden="true" />
    </div>
  );
});
