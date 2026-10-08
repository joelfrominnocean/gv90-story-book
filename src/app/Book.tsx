import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Rect, SelectedBook } from "../book3d/Stage3D";
import type { ShelfBookSpec } from "../book3d/shelf";
import { drawSpecFor } from "../book/drawSpecs";
import { readInsets } from "../book/layout";
import { buildPages } from "../book/pages";
import { useElementSize, useFontsReady } from "../book/useLayout";
import { Cover } from "../components/Cover";
import { CoverOverlay } from "../components/CoverOverlay";
import { DebugPanel } from "../components/DebugPanel";
import { HotspotSheet } from "../components/HotspotSheet";
import { Library } from "../components/Library";
import { LibraryOverlay } from "../components/LibraryOverlay";
import { PageView } from "../components/PageView";
import { SealedPage } from "../components/SealedPage";
import { TopBar } from "../components/TopBar";
import { VideoPlayer } from "../components/VideoPlayer";
import { GlasshouseRoom } from "../room/GlasshouseRoom";
import { ListeningRoom, type RoomHandle } from "../room/ListeningRoom";
import { RoomOverlay } from "../room/RoomOverlay";
import { TaleBook } from "../room/TaleBook";
import { WallOverlay } from "../wall/WallOverlay";
import { WallPlate, type WallPlateHandle } from "../wall/WallPlate";
import { content, fill, ui, unlockState, type Chapter, type Hotspot } from "../content";
import { FireSound } from "./fireSound";
import { detect3d } from "./mode3d";
import { SceneBoundary } from "./SceneBoundary";
import { usePrefersReducedMotion, writeRoute, type Route } from "./useRoute";

// three.js and the scene load as their own chunk, so the library title and first content are not held up by them.
const Stage3D = lazy(() => import("../book3d/Stage3D"));

const COUNT = content.chapters.length;
/** Tap this close to a page edge to turn the page. */
const EDGE_PX = 28;
const SWIPE_PX = 56;

/**
 * The library holds one book per chapter. A book is a run of pages; nothing scrolls.
 *
 * `page` is -1 while the book is closed on its cover, then 0..n-1. With 3D on, a Three.js book sits behind
 * the page: reading happens in the live HTML on top of the page the camera is looking down at, and on a turn
 * the HTML steps aside, the leaf curls over, and the next page settles in. Without 3D (reduced motion, no
 * WebGL, weak device) the same pages turn by crossfade.
 */
export function Book({ route }: { route: Route }) {
  const reduceMotion = usePrefersReducedMotion();
  const [use3d] = useState(() => detect3d(route.search));
  const [sceneFailed, setSceneFailed] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [turning, setTurning] = useState(false);
  const scene3d = use3d && !sceneFailed;

  const initial = route.chapter !== null && route.chapter < COUNT ? route.chapter : null;
  // The library is a wide picture of the whole wall (src/wall) when it is built in and 3D is on; the 3D shelf is the fallback.
  const [wallFailed, setWallFailed] = useState(false);
  const [wallLoaded, setWallLoaded] = useState(false);
  // On this branch the default library is the listening room (src/room); ?library=wall brings back v1's bookcase wall.
  const useRoom = useMemo(() => new URLSearchParams(route.search).get("library") !== "wall", [route.search]);
  const wall = scene3d && (useRoom || (__HAS_WALL__ && !wallFailed));
  const [focusN, setFocusN] = useState<number | null>(use3d && (useRoom || __HAS_WALL__) ? initial : null);
  const roomRef = useRef<RoomHandle>(null);
  // The room is the layered glasshouse when it has been built; ?room=svg shows the earlier flat vector room instead.
  const glasshouse = useMemo(() => (__HAS_GLASSHOUSE__ || __HAS_VECTOR_SCENE__) && new URLSearchParams(route.search).get("room") !== "svg", [route.search]);
  const Room = (glasshouse ? GlasshouseRoom : ListeningRoom) as typeof ListeningRoom;
  const [taleOpen, setTaleOpen] = useState(false);
  const [patchN, setPatchN] = useState<number | null>(null);
  const [bookDown, setBookDown] = useState(false);
  const [zoomedOut, setZoomedOut] = useState(false);
  const plateRef = useRef<WallPlateHandle>(null);
  const pendingOpen = useRef<number | null>(null);
  const [chapterIdx, setChapterIdx] = useState<number | null>(initial);
  const chapterIdxRef = useRef(chapterIdx);
  chapterIdxRef.current = chapterIdx;
  const [page, setPage] = useState(-1);
  const [leaving, setLeaving] = useState(false);
  const [sheet, setSheet] = useState<{ chapter: Chapter; hotspot: Hotspot } | null>(null);
  const [video, setVideo] = useState<{ chapter: Chapter; at: number } | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [sound, setSound] = useState(false);
  const [overview, setOverview] = useState(false);
  const fireSound = useRef<FireSound | null>(null);

  const bookRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(bookRef);
  const insets = useMemo(readInsets, []);
  const wallSize = useMemo(() => ({ width: size.vw, height: size.vh }), [size.vw, size.vh]);
  const fontsReady = useFontsReady();

  const returnFocus = useRef<HTMLElement | null>(null);
  const autoTimer = useRef<number | undefined>(undefined);
  const turnGuard = useRef<number | undefined>(undefined);
  const pointer = useRef<{ x: number; y: number; t: number } | null>(null);
  const pageRef = useRef(-1);
  const wantPage = useRef(route.page ?? 0);
  const overlayOpen = sheet !== null || video !== null || taleOpen;

  const chapter = chapterIdx !== null ? content.chapters[chapterIdx]! : null;
  const unlock = chapter ? unlockState(chapter, route.preview) : null;
  const pages = useMemo(() => (chapter && unlock ? buildPages(chapter, unlock.open) : []), [chapter, unlock?.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const drawPages = useMemo(
    () => (chapter ? pages.map((p) => drawSpecFor(chapter, p, { preview: route.preview, ryi: route.ryi })) : []),
    [chapter, pages, route.preview, route.ryi],
  );

  // The six books on the shelf. Thickness comes from the unlocked page count; a locked one wears a paper band with its date.
  const shelfBooks = useMemo<ShelfBookSpec[]>(() => {
    const states = content.chapters.map((ch) => unlockState(ch, route.preview));
    const newest = states.reduce((acc, st, i) => (st.open ? i : acc), -1);
    return content.chapters.map((ch, i) => {
      const [day, month] = (states[i]!.dateLabel ?? "").split(" ");
      return {
        n: ch.n,
        title: ch.title.text ?? "",
        accent: ch.theme.accent.hex,
        pageCount: buildPages(ch, true).length,
        locked: !states[i]!.open,
        band: states[i]!.open ? null : day && month ? [day, month.slice(0, 3)] : ["–", "TBC"],
        highlight: i === newest,
      };
    });
  }, [route.preview]);
  const shelfLabels = useMemo(
    () =>
      content.chapters.map((ch) => {
        const st = unlockState(ch, route.preview);
        const title = ch.title.text ?? ch.id;
        return st.open ? title : `${title}, ${ui("sealed").text}, ${st.dateLabel ? fill(ui("opensOn").text ?? "", { date: st.dateLabel }) : ui("dateTbc").text}`;
      }),
    [route.preview],
  );
  const selected = useMemo<SelectedBook | null>(
    () =>
      chapter
        ? { n: chapter.n, pages: drawPages, pageCount: shelfBooks[chapter.n]!.pageCount, mode: chapter.theme.mode, accent: chapter.theme.accent.hex, title: chapter.title.text ?? "GV90" }
        : null,
    [chapter, drawPages, shelfBooks],
  );

  const startMove = useCallback(() => {
    // Hide the live page / disable the shelf until the book has finished moving. The guard means a stuck animation can never leave it so.
    setTurning(true);
    window.clearTimeout(turnGuard.current);
    turnGuard.current = window.setTimeout(() => setTurning(false), 5000);
  }, []);

  // The fire crackles only while the library is up, and only once the reader has turned sound on.
  useEffect(() => {
    fireSound.current?.set(sound && chapterIdx === null);
  }, [sound, chapterIdx]);
  const toggleSound = useCallback(() => {
    // The room owns its own sound (rain, the record, the jar), so it is switched there; the label follows via onSoundChange.
    if (useRoom) return roomRef.current?.toggleSound();
    fireSound.current ??= new FireSound();
    fireSound.current.unlock(); // inside the tap, while the browser allows audio to start
    setSound((s) => !s);
  }, [useRoom]);

  const onSettled = useCallback(() => {
    window.clearTimeout(turnGuard.current);
    setTurning(false);
    if (chapterIdxRef.current !== null) setBookDown(true);
    else {
      // The book is back in its place: the picture shows it again, and the wall is free to look around.
      setPatchN(null);
      setFocusN(null);
    }
  }, []);
  const onReady = useCallback(() => setSceneReady(true), []);

  const go = useCallback(
    (n: number) => {
      window.clearTimeout(autoTimer.current);
      const next = Math.max(-1, Math.min(pagesRef.current.length - 1, n));
      setSheet(null);
      setVideo(null);
      // Hide the live page until the leaf has landed.
      if (scene3d && sceneReady && next !== pageRef.current) startMove();
      pageRef.current = next;
      setPage(next);
      setChapterIdx((c) => {
        if (c !== null) writeRoute(c, next);
        return c;
      });
    },
    [scene3d, sceneReady, startMove],
  );
  const goRef = useRef(go);
  goRef.current = go;

  const beginOpen = useCallback(
    (c: number) => {
      window.clearTimeout(autoTimer.current);
      setLeaving(false);
      setBookDown(false);
      setSheet(null);
      setVideo(null);
      setTurning(false);
      pageRef.current = -1;
      wantPage.current = 0;
      setPage(-1);
      // The 3D stage takes the book down off its shelf before it opens.
      if (scene3d && sceneReady) startMove();
      setChapterIdx(c);
      writeRoute(c, null);
    },
    [scene3d, sceneReady, startMove],
  );

  // On the wall, a pick first zooms the picture to the view the 3D camera will use; the book comes down once that is done.
  const openBook = useCallback(
    (c: number) => {
      if (!wall) return beginOpen(c);
      pendingOpen.current = c;
      setSheet(null);
      setVideo(null);
      setFocusN(c);
    },
    [wall, beginOpen],
  );
  const onFocused = useCallback(() => {
    const c = pendingOpen.current;
    pendingOpen.current = null;
    if (c !== null) beginOpen(c);
  }, [beginOpen]);

  const toLibrary = useCallback(() => {
    window.clearTimeout(autoTimer.current);
    setLeaving(false);
    setSheet(null);
    setVideo(null);
    pageRef.current = -1;
    setPage(-1);
    // The 3D stage puts the book back on its shelf; the shelf waits until it has.
    if (scene3d && sceneReady) startMove();
    else {
      setPatchN(null);
      setFocusN(null);
    }
    setBookDown(false);
    setChapterIdx(null);
    writeRoute(null, null);
  }, [scene3d, sceneReady, startMove]);

  // Back to the library: close the cover first when the 3D book is up, then put the book back.
  const leave = useCallback(() => {
    if (scene3d && sceneReady && pageRef.current >= 0) {
      setLeaving(true);
      go(-1);
    } else toLibrary();
  }, [scene3d, sceneReady, go, toLibrary]);

  useEffect(() => {
    if (leaving && !turning && page === -1) toLibrary();
  }, [leaving, turning, page, toLibrary]);

  // A book opens by itself once it is on the table: from the library, or from an eDM link (?chapter=N).
  useEffect(() => {
    if (chapterIdx === null || leaving || page !== -1) return;
    if (scene3d && (!sceneReady || turning)) return;
    autoTimer.current = window.setTimeout(() => goRef.current(Math.min(wantPage.current, pagesRef.current.length - 1)), reduceMotion ? 400 : scene3d ? 350 : 900);
    return () => window.clearTimeout(autoTimer.current);
  }, [chapterIdx, leaving, page, scene3d, sceneReady, turning, reduceMotion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (overlayOpen || chapterIdx === null) return;
      if (e.key === "ArrowRight") go(page + 1);
      else if (e.key === "ArrowLeft") go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, overlayOpen, chapterIdx, go]);

  const restoreFocus = () => requestAnimationFrame(() => returnFocus.current?.focus());

  const openSheet = (c: Chapter, hotspot: Hotspot, trigger: HTMLElement) => {
    returnFocus.current = trigger;
    setSheet({ chapter: c, hotspot });
  };
  const closeSheet = useCallback(() => {
    setSheet(null);
    restoreFocus();
  }, []);
  const openVideo = (c: Chapter, at: number, trigger?: HTMLElement) => {
    if (trigger) returnFocus.current = trigger;
    setSheet(null);
    setVideo({ chapter: c, at });
  };
  const closeVideo = useCallback(() => {
    setVideo(null);
    restoreFocus();
  }, []);

  // Swipe or tap the page edge to turn. The page itself never scrolls (touch-action: pan-y keeps the browser out of the way).
  const onPointerDown = (e: PointerEvent) => {
    if (e.isPrimary) pointer.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    pointer.current = null;
    if (!p || overlayOpen || chapterIdx === null || leaving) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.6) return go(page + (dx < 0 ? 1 : -1));
    const isTap = Math.hypot(dx, dy) < 10 && performance.now() - p.t < 400;
    if (!isTap) return;
    if ((e.target as HTMLElement).closest("button, a, summary, details, input")) return;
    if (page === -1) return go(0); // the closed book is the button
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < EDGE_PX) go(page - 1);
    else if (x > rect.width - EDGE_PX) go(page + 1);
  };

  const spec = page >= 0 ? pages[page] : undefined;
  const style = { "--accent": chapter ? chapter.theme.accent.hex : "#BFD9D2" } as CSSProperties;
  const turn = { canPrev: page >= 0, canNext: page < pages.length - 1, onPrev: () => go(page - 1), onNext: () => go(page + 1) };

  return (
    <div ref={bookRef} className="book" data-mode={chapter && page >= 0 ? chapter.theme.mode : "ink"} data-3d={scene3d && sceneReady ? "on" : "off"} style={style}>
      {wall && useRoom && (
        <Room
          ref={roomRef}
          size={wallSize}
          books={shelfBooks}
          labels={shelfLabels}
          busy={turning || !sceneReady || chapterIdx !== null}
          focusN={focusN}
          paused={bookDown || taleOpen}
          reduceMotion={reduceMotion}
          onPick={openBook}
          onFocused={onFocused}
          onLoaded={() => setWallLoaded(true)}
          onSoundChange={setSound}
          onOpenTale={() => setTaleOpen(true)}
          onOverviewChange={setOverview}
        />
      )}
      {wall && !useRoom && (
        <WallPlate
          ref={plateRef}
          size={wallSize}
          books={shelfBooks}
          labels={shelfLabels}
          busy={turning || !sceneReady || chapterIdx !== null}
          focusN={focusN}
          patchN={patchN}
          paused={bookDown}
          reduceMotion={reduceMotion}
          onPick={openBook}
          onFocused={onFocused}
          onLoaded={() => setWallLoaded(true)}
          onFailed={() => setWallFailed(true)}
          onZoomedOut={setZoomedOut}
        />
      )}
      {scene3d && (
        <div className={`book3d${sceneReady ? " is-ready" : ""}`} aria-hidden="true">
          <SceneBoundary onError={() => setSceneFailed(true)}>
            <Suspense fallback={null}>
              <Stage3D
                books={shelfBooks}
                selected={selected}
                view={page}
                insets={insets}
                htmlShown={!turning}
                onRects={setRects}
                onSettled={onSettled}
                onReady={onReady}
                wall={wall}
                onLifted={setPatchN}
              />
            </Suspense>
          </SceneBoundary>
        </div>
      )}

      <div className="stage" data-turning={turning} data-wall={wall && !chapter} inert={overlayOpen} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        {chapter && page >= 0 && <TopBar page={page} total={pages.length} onLibrary={leave} />}

        {!chapter ? (
          scene3d ? (
            wall ? (
              wallLoaded && (useRoom ? <RoomOverlay sound={sound} onSound={toggleSound} overview={overview} onOverview={() => roomRef.current?.toggleOverview?.()} /> : <WallOverlay sound={sound} onSound={toggleSound} zoomedOut={zoomedOut} onZoom={() => plateRef.current?.toggleZoom()} />)
            ) : (
              <LibraryOverlay rects={sceneReady ? rects : []} labels={shelfLabels} busy={turning} sound={sound} onSound={toggleSound} onOpen={openBook} />
            )
          ) : (
            <Library preview={route.preview} onOpen={openBook} />
          )
        ) : page === -1 ? (
          scene3d && sceneReady ? <CoverOverlay chapter={chapter} /> : <Cover chapter={chapter} />
        ) : spec?.kind === "sealed" && unlock ? (
          <SealedPage key={`${chapter.n}-${page}`} chapter={chapter} state={unlock} {...turn} />
        ) : spec ? (
          <PageView
            key={`${chapter.n}-${page}`}
            chapter={chapter}
            spec={spec}
            ryi={route.ryi}
            search={route.search}
            size={size}
            insets={insets}
            fontsReady={fontsReady}
            onHotspot={(h, trigger) => openSheet(chapter, h, trigger)}
            onWatch={(trigger) => openVideo(chapter, 0, trigger)}
            turn={turn}
          />
        ) : null}
      </div>

      {taleOpen && <TaleBook onClose={() => setTaleOpen(false)} onTurn={() => roomRef.current?.pageTurn()} />}
      {sheet && (
        <HotspotSheet chapter={sheet.chapter} hotspot={sheet.hotspot} onClose={closeSheet} onPlay={() => openVideo(sheet.chapter, sheet.hotspot.videoAt ?? 0)} />
      )}
      {video && <VideoPlayer chapter={video.chapter} at={video.at} onClose={closeVideo} />}
      {route.debug && (
        <DebugPanel
          route={route}
          view={chapter ? `ch${chapter.n} · p${page + 1}/${pages.length}` : "library"}
          open={unlock?.open ?? true}
          mode={scene3d ? (sceneReady ? "3d" : "3d (loading)") : "2d"}
        />
      )}
    </div>
  );
}
