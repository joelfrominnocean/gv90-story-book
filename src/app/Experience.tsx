import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ShelfBookSpec } from "../book3d/shelf";
import { useElementSize } from "../book/useLayout";
import { DebugPanel } from "../components/DebugPanel";
import { content, fill, ui, unlockState } from "../content";
import { GlasshouseRoom } from "../room/GlasshouseRoom";
import { ListeningRoom, type RoomHandle } from "../room/ListeningRoom";
import { RoomOverlay } from "../room/RoomOverlay";
import { TaleBook } from "../room/TaleBook";
import { buildScenes } from "../screening/scenes";
import { Screening } from "../screening/Screening";
import { usePrefersReducedMotion, writeRoute, type Route } from "./useRoute";

const COUNT = content.chapters.length;

/**
 * The room, and the six chapters as screenings. The room is the place; a poster on the folding screen is the way into a chapter, and a
 * chapter is a run of full-bleed scenes (src/screening), not a book. The folk tale stays a book, because it is a story to read. The
 * earlier book and 3D library are still there under `?format=book` (see Book.tsx), for comparison.
 *
 * `?chapter=N` opens chapter N straight away (an eDM link); `?page=M` starts it at scene M.
 */
export function Experience({ route }: { route: Route }) {
  const reduceMotion = usePrefersReducedMotion();
  const glasshouse = useMemo(() => (__HAS_GLASSHOUSE__ || __HAS_VECTOR_SCENE__) && new URLSearchParams(route.search).get("room") !== "svg", [route.search]);
  const Room = (glasshouse ? GlasshouseRoom : ListeningRoom) as typeof ListeningRoom;
  const rootRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(rootRef);
  const roomSize = useMemo(() => ({ width: size.vw, height: size.vh }), [size.vw, size.vh]);
  const roomRef = useRef<RoomHandle>(null);

  const initial = route.chapter !== null && route.chapter < COUNT ? route.chapter : null;
  const [open, setOpen] = useState<number | null>(initial);
  const [focusN, setFocusN] = useState<number | null>(initial);
  const [scene, setScene] = useState<number>(initial !== null ? route.page ?? 0 : 0);
  const [leaving, setLeaving] = useState(false);
  const [taleOpen, setTaleOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const [overview, setOverview] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const pending = useRef<number | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  // The six posters: open ones are pictures, sealed ones are dark frames with a brass date, exactly as the folding screen draws them.
  const shelfBooks = useMemo<ShelfBookSpec[]>(() => {
    const states = content.chapters.map((ch) => unlockState(ch, route.preview));
    const newest = states.reduce((acc, st, i) => (st.open ? i : acc), -1);
    return content.chapters.map((ch, i) => {
      const [day, month] = (states[i]!.dateLabel ?? "").split(" ");
      return {
        n: ch.n,
        title: ch.title.text ?? "",
        accent: ch.theme.accent.hex,
        pageCount: buildScenes(ch, true).length,
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

  // A poster is picked: the room dims first (the room does that, then calls onFocused), then the screening comes up over it.
  const onPick = useCallback((n: number) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pending.current = n;
    setFocusN(n);
  }, []);
  const onFocused = useCallback(() => {
    const n = pending.current;
    pending.current = null;
    if (n === null) return;
    setLeaving(false);
    setScene(0);
    setOpen(n);
    writeRoute(n, 0);
  }, []);
  const close = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    leaveTimer.current = window.setTimeout(
      () => {
        setOpen(null);
        setFocusN(null);
        setLeaving(false);
        writeRoute(null, null);
        requestAnimationFrame(() => returnFocus.current?.focus());
      },
      reduceMotion ? 0 : 450,
    );
  }, [leaving, reduceMotion]);
  const onScene = useCallback(
    (n: number) => {
      setScene(n);
      if (open !== null) writeRoute(open, n);
    },
    [open],
  );

  const toggleSound = useCallback(() => roomRef.current?.toggleSound(), []);
  const chapter = open !== null ? content.chapters[open]! : null;
  const state = chapter ? unlockState(chapter, route.preview) : null;
  const style = { "--accent": chapter ? chapter.theme.accent.hex : "#BFD9D2" } as CSSProperties;

  return (
    <div ref={rootRef} className="book" data-mode="ink" data-3d="off" style={style}>
      <Room
        ref={roomRef}
        size={roomSize}
        books={shelfBooks}
        labels={shelfLabels}
        busy={open !== null}
        focusN={focusN}
        paused={open !== null || taleOpen}
        reduceMotion={reduceMotion}
        onPick={onPick}
        onFocused={onFocused}
        onLoaded={() => setLoaded(true)}
        onSoundChange={setSound}
        onOpenTale={() => setTaleOpen(true)}
        onOverviewChange={setOverview}
      />
      {loaded && (
        <div className="stage" data-wall="true" inert={open !== null || taleOpen} style={{ visibility: open !== null ? "hidden" : "visible" }}>
          <RoomOverlay sound={sound} onSound={toggleSound} overview={overview} onOverview={() => roomRef.current?.toggleOverview?.()} />
        </div>
      )}
      {chapter && state && (
        <Screening
          key={chapter.n}
          chapter={chapter}
          state={state}
          scene={scene}
          onScene={onScene}
          onClose={close}
          leaving={leaving}
          ryi={route.ryi}
          search={route.search}
          reduceMotion={reduceMotion}
        />
      )}
      {taleOpen && <TaleBook onClose={() => setTaleOpen(false)} onTurn={() => roomRef.current?.pageTurn?.()} />}
      {route.debug && <DebugPanel route={route} view={chapter ? `ch${chapter.n} · scene ${scene + 1}` : "room"} open={state?.open ?? true} mode="screening" />}
    </div>
  );
}
