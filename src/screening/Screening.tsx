import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from "react";
import { useDebug } from "../app/debug";
import { eyebrowFor } from "../book/pages";
import { Badge, Copy } from "../components/Copy";
import { HotspotSheet } from "../components/HotspotSheet";
import { Lamps } from "../components/Lamps";
import { VideoPlayer } from "../components/VideoPlayer";
import { content, ctaHref, ui, type Chapter, type Hotspot, type Media, type UnlockState } from "../content";
import "../styles/screening.css";
import { buildScenes, isFilm } from "./scenes";

interface Props {
  chapter: Chapter;
  state: UnlockState;
  scene: number;
  onScene: (n: number) => void;
  onClose: () => void;
  leaving: boolean;
  ryi: boolean;
  search: string;
  reduceMotion: boolean;
}

const SWIPE_PX = 56;

/** One hero, full bleed and slowly drifting; a film plays muted on a loop while it is the one on show. */
function Backdrop({ media, on, still }: { media: Media; on: boolean; still: boolean }) {
  const debug = useDebug();
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const alt = media.alt.text ?? media.assetName;
  const focal = media.focal ? `${media.focal.x}% ${media.focal.y}%` : "50% 50%";
  const film = isFilm(media.src);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (on) void v.play().catch(() => undefined);
    else v.pause();
  }, [on]);
  return (
    <div className="scr__media" data-on={on} data-still={still}>
      {media.src && !failed ? (
        <>
          {/* a blurred, dimmed copy of a still spills its light into the dark around the picture */}
          {!film && <img className="scr__ambient" src={media.src} alt="" aria-hidden="true" decoding="async" />}
          {/* the picture itself, at its own shape across the full width, feathered into the dark above and below it: a cinema frame, not a crop */}
          <div className="scr__frame" data-aspect={media.aspect}>
            {film ? (
              <video ref={video} src={media.src} muted loop playsInline preload="metadata" aria-label={alt} style={{ objectPosition: focal }} onError={() => setFailed(true)} />
            ) : (
              <img src={media.src} alt={on ? alt : ""} style={{ objectPosition: focal }} decoding="async" onError={() => setFailed(true)} />
            )}
          </div>
        </>
      ) : (
        <div className="scr__ph" role="img" aria-label={alt}>
          <span>
            <b>Placeholder</b> {media.assetName}
          </span>
        </div>
      )}
      {media.status === "placeholder" && media.src && !failed && on && (
        <span className="scr__tag">
          <b>Placeholder</b> {media.assetName}
        </span>
      )}
      {debug && on && (
        <small className="scr__dbg">
          {media.assetName} · {media.status}
          {media.note ? ` · ${media.note}` : ""}
        </small>
      )}
    </div>
  );
}

/**
 * A chapter, as a screening. The room dims behind it and it takes the whole screen: one picture or film at a time, one line fading in
 * over it, a tap to go on (the right of the screen goes forward, the left edge back; so does a swipe or the arrow keys), a hairline
 * at the top that is the only sign of how far there is to go. Nothing is a page and nothing scrolls. All copy is the chapter's own,
 * through <Copy>, so provenance and pending-copy labels work exactly as before.
 */
export function Screening({ chapter, state, scene, onScene, onClose, leaving, ryi, search, reduceMotion }: Props) {
  const debug = useDebug();
  const scenes = useMemo(() => buildScenes(chapter, state.open), [chapter, state.open]);
  const index = Math.max(0, Math.min(scene, scenes.length - 1));
  const cur = scenes[index]!;
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ x: number; y: number; t: number } | null>(null);
  const [sheet, setSheet] = useState<{ hotspot: Hotspot; trigger: HTMLElement } | null>(null);
  const [film, setFilm] = useState<{ at: number } | null>(null);
  const overlay = sheet !== null || film !== null;
  const heroIndex = cur.kind === "sealed" ? 0 : cur.hero;

  const go = useCallback(
    (n: number) => {
      const next = Math.max(0, Math.min(scenes.length - 1, n));
      if (next !== index) onScene(next);
    },
    [scenes.length, index, onScene],
  );

  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlay) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, index, go, onClose]);

  const onPointerDown = (e: RPointerEvent) => {
    if (e.isPrimary) pointer.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    pointer.current = null;
    if (!p || overlay) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.6) return go(index + (dx < 0 ? 1 : -1));
    if (Math.hypot(dx, dy) > 10 || performance.now() - p.t > 450) return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    const r = e.currentTarget.getBoundingClientRect();
    go(e.clientX - r.left < r.width * 0.28 ? index - 1 : index + 1);
  };

  const cta = content.meta.cta;
  const teaser = chapter.sealedTeaser ?? content.meta.sealedTeaser;
  const style = { "--accent": chapter.theme.accent.hex, "--p": `${((index + 1) / scenes.length) * 100}%` } as CSSProperties;
  const last = index === scenes.length - 1;

  return (
    <div
      ref={root}
      className="screening"
      data-kind={cur.kind}
      data-leaving={leaving}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={chapter.title.text ?? undefined}
      tabIndex={-1}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {chapter.heroes.map((h, i) => (
        <Backdrop key={i} media={h} on={i === heroIndex && cur.kind !== "sealed"} still={reduceMotion} />
      ))}
      <div className="scr__scrim" aria-hidden="true" />

      <div className="scr__bar" inert={overlay}>
        <button type="button" className="scr__close" onClick={onClose} aria-label={ui("close").text ?? undefined}>
          <span className="icon-x" aria-hidden="true" />
        </button>
        <div className="scr__progress" aria-hidden="true">
          <i />
        </div>
      </div>

      <div className="scr__stage" inert={overlay} aria-live="polite">
        {cur.kind === "frame" && cur.first && (
          <header className="scr__title" key={`t${index}`}>
            <p className="scr__eyebrow">
              <Copy s={eyebrowFor(chapter)} vars={{ n: chapter.n }} />
            </p>
            <h1>
              <Copy s={chapter.title} />
            </h1>
            {chapter.epigraph && <Copy s={chapter.epigraph} as="p" className="scr__epigraph" />}
            {debug && (
              <small className="scr__dbg2">
                unlocked by: {chapter.unlockedBy.text} · audience: {chapter.audience.segment} · opens {chapter.unlock.at ?? "tbc"}
                {chapter.unlock.placeholder ? " (placeholder)" : ""}
              </small>
            )}
          </header>
        )}

        {cur.kind === "line" && (
          <div className="scr__line" key={`l${index}`}>
            <Copy s={chapter.modules[cur.module]!.beats[cur.beat]!} as="p" />
          </div>
        )}

        {cur.kind === "details" && (
          <div className="scr__plate" key={`d${index}`} style={{ ["--ar" as string]: chapter.heroes[0]!.aspect === "4:5" ? "4 / 5" : "16 / 9" }}>
            {chapter.heroes[0]!.src && !isFilm(chapter.heroes[0]!.src) ? <img src={chapter.heroes[0]!.src} alt="" /> : <div className="scr__ph scr__ph--plate" aria-hidden="true" />}
            {chapter.hotspots.map((h) => (
              <button
                key={h.id}
                type="button"
                className="scr__mark"
                style={{ left: `${h.at.x}%`, top: `${h.at.y}%` }}
                aria-label={h.label.text ?? h.id}
                aria-haspopup="dialog"
                onClick={(e) => setSheet({ hotspot: h, trigger: e.currentTarget })}
              >
                <i />
              </button>
            ))}
          </div>
        )}

        {cur.kind === "film" && (
          <button type="button" className="scr__play" key={`f${index}`} onClick={() => setFilm({ at: 0 })}>
            <span className="scr__play-ring" aria-hidden="true" />
            <span className="scr__play-label">
              <Copy s={ui("watch")} badge={false} />
            </span>
          </button>
        )}

        {cur.kind === "close" && (
          <div className="scr__close-scene" key={`c${index}`}>
            <Lamps />
            {chapter.showCta && (
              <div className="scr__cta">
                {ryi ? (
                  <span className="scr__cta-line scr__cta-line--soon">
                    <Copy s={cta.ryiLabel} badge={false} />
                  </span>
                ) : (
                  <a className="scr__cta-line" href={ctaHref(search)} target="_blank" rel="noopener noreferrer">
                    <Copy s={cta.label} badge={false} />
                    <span className="cta__arrow" aria-hidden="true" />
                  </a>
                )}
                {debug && <Badge s={ryi ? cta.ryiLabel : cta.label} />}
              </div>
            )}
          </div>
        )}

        {cur.kind === "sealed" && (
          <div className="scr__sealed" key={`s${index}`}>
            <p className="scr__eyebrow">
              <Copy s={eyebrowFor(chapter)} vars={{ n: chapter.n }} />
            </p>
            <h1>
              <Copy s={chapter.title} />
            </h1>
            <Lamps dim />
            <Copy s={teaser} as="p" className="scr__teaser" />
            <p className="scr__opens">
              <Copy s={ui("sealed")} />
              {" · "}
              {state.dateLabel ? <Copy s={ui("opensOn")} vars={{ date: state.dateLabel }} /> : <Copy s={ui("dateTbc")} />}
            </p>
          </div>
        )}
      </div>

      {!last && !overlay && <span className="scr__more" aria-hidden="true" />}

      {sheet && (
        <HotspotSheet
          chapter={chapter}
          hotspot={sheet.hotspot}
          onClose={() => {
            const t = sheet.trigger;
            setSheet(null);
            requestAnimationFrame(() => t.focus());
          }}
          onPlay={() => {
            setSheet(null);
            setFilm({ at: sheet.hotspot.videoAt ?? 0 });
          }}
        />
      )}
      {film && <VideoPlayer chapter={chapter} at={film.at} onClose={() => setFilm(null)} />}
    </div>
  );
}
