import { useMemo } from "react";
import { useDebug } from "../app/debug";
import { GUTTER } from "../book/layout";
import { fitBeats, type Insets } from "../book/layout";
import { eyebrowFor, type PageSpec } from "../book/pages";
import { content, ctaHref, ui, type Chapter, type Hotspot } from "../content";
import { Badge, Copy } from "./Copy";
import { Hero } from "./Hero";
import { Lamps } from "./Lamps";
import { MoonJar } from "./MoonJar";
import { PageTurners } from "./PageTurners";

interface Props {
  chapter: Chapter;
  spec: PageSpec;
  ryi: boolean;
  search: string;
  size: { vw: number; vh: number };
  insets: Insets;
  fontsReady: boolean;
  onHotspot: (h: Hotspot, trigger: HTMLElement) => void;
  onWatch: (trigger: HTMLElement) => void;
  turn: { canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void };
}

function Header({ chapter, withEpigraph }: { chapter: Chapter; withEpigraph: boolean }) {
  const debug = useDebug();
  return (
    <header className="head">
      <MoonJar />
      <p className="eyebrow">
        <Copy s={eyebrowFor(chapter)} vars={{ n: chapter.n }} />
      </p>
      <h1 className="title">
        <Copy s={chapter.title} />
      </h1>
      {withEpigraph && chapter.epigraph && <Copy s={chapter.epigraph} as="p" className="epigraph" />}
      {debug && (
        <p className="dbg-meta">
          unlocked by: {chapter.unlockedBy.text} · audience: {chapter.audience.segment} · opens {chapter.unlock.at ?? "tbc"}
          {chapter.unlock.placeholder ? " (placeholder)" : ""} · accent: {chapter.theme.accent.name}
          {chapter.headerDirection && (
            <>
              <br />
              header direction: <Copy s={chapter.headerDirection} />
            </>
          )}
        </p>
      )}
    </header>
  );
}

function Watch({ onWatch }: { onWatch: (trigger: HTMLElement) => void }) {
  return (
    <button type="button" className="watch" onClick={(e) => onWatch(e.currentTarget)}>
      <span className="watch__icon" aria-hidden="true" />
      <Copy s={ui("watch")} badge={false} />
    </button>
  );
}

/** Debug only: the brief's module name and creative direction for the page. */
function ModuleNote({ chapter, module }: { chapter: Chapter; module: number }) {
  const debug = useDebug();
  const m = chapter.modules[module];
  if (!debug || !m) return null;
  return (
    <details className="dbg-module">
      <summary>
        <Copy s={m.label} />
      </summary>
      {m.direction && <Copy s={m.direction} as="p" className="dbg-direction" />}
    </details>
  );
}

export function PageView({ chapter, spec, ryi, search, size, insets, fontsReady, onHotspot, onWatch, turn }: Props) {
  const debug = useDebug();
  const label = chapter.title.text ?? undefined;
  const turners = <PageTurners {...turn} />;

  // Beat text is sized so the whole page fits with no scrolling; the leaf textures use the same numbers.
  const beats = spec.kind === "beats" ? spec.beats.map((i) => chapter.modules[spec.module]!.beats[i]!) : [];
  const fit = useMemo(
    () =>
      spec.kind === "beats"
        ? fitBeats(
            beats.flatMap((b) => (b.text === null ? [] : [b.text])),
            size.vw,
            size.vh,
            insets,
          )
        : null,
    // fontsReady re-runs the measurement once the real font is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, chapter, size.vw, size.vh, insets, fontsReady],
  );

  switch (spec.kind) {
    case "opener": {
      const hero = chapter.heroes[0]!;
      const maxH = hero.aspect === "16:9" ? (size.vw * 9) / 16 : (size.vw - GUTTER * 2) * 1.25;
      return (
        <article className="page page--opener" aria-label={label} style={{ ["--hero-max" as string]: `${maxH}px` }}>
          <Header chapter={chapter} withEpigraph />
          <Hero media={hero} hotspots={chapter.hotspots} onHotspot={onHotspot} />
          {chapter.video && <Watch onWatch={onWatch} />}
          {turners}
        </article>
      );
    }

    case "panel": {
      const media = chapter.heroes[spec.hero]!;
      const first = spec.hero === 0;
      const maxH = media.aspect === "16:9" ? (size.vw * 9) / 16 : (size.vw - GUTTER * 2) * 1.25;
      return (
        <article
          className={`page page--panel${first ? " page--opener" : " page--silent"}`}
          aria-label={label}
          style={first ? { ["--hero-max" as string]: `${maxH}px` } : undefined}
        >
          {first && <Header chapter={chapter} withEpigraph={false} />}
          <ModuleNote chapter={chapter} module={spec.hero} />
          <Hero media={media} hotspots={first ? chapter.hotspots : []} onHotspot={onHotspot} />
          {first && chapter.video && <Watch onWatch={onWatch} />}
          {turners}
        </article>
      );
    }

    case "beats":
      return (
        <article className="page page--beats" aria-label={label}>
          {spec.first && <ModuleNote chapter={chapter} module={spec.module} />}
          <div className="pgbeats" style={{ ["--fs" as string]: `${fit?.fs ?? 28}px` }}>
            {beats.map((b, i) => (
              <Copy key={i} s={b} as="p" className={`pgbeat${b.text === null ? " pgbeat--pending" : ""}`} />
            ))}
          </div>
          {turners}
        </article>
      );

    case "close": {
      const cta = content.meta.cta;
      return (
        <article className="page page--close" aria-label={label}>
          <div className="closing">
            <Lamps />
            <div className="cta">
              {ryi ? (
                <span className="cta__line cta__line--soon">
                  <Copy s={cta.ryiLabel} badge={false} />
                </span>
              ) : (
                <a className="cta__line" href={ctaHref(search)} target="_blank" rel="noopener noreferrer">
                  <Copy s={cta.label} badge={false} />
                  <span className="cta__arrow" aria-hidden="true" />
                </a>
              )}
              {debug && <Badge s={ryi ? cta.ryiLabel : cta.label} />}
            </div>
          </div>
          {turners}
        </article>
      );
    }

    case "sealed":
      // Handled by the caller (it needs the unlock state).
      return null;
  }
}
