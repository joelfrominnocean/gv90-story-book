import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Copy } from "../components/Copy";
import { content, fill, ui } from "../content";
import { TaleArt } from "./TaleArt";

interface Props {
  onClose: () => void;
  /** A page turned: the room plays the sound of paper. */
  onTurn?: () => void;
}

const SWIPE = 48;

/**
 * The folk tale, a page at a time: an illustration over a few lines. Swipe, tap either side of the picture, use the arrows or
 * the keyboard. There is no progress bar and no score; closing it puts you back in the room with the rain still going.
 */
export function TaleBook({ onClose, onTurn }: Props) {
  const tale = content.meta.tale;
  const total = tale?.pages.length ?? 0;
  const [p, setP] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const start = useRef<{ x: number; y: number } | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const go = useCallback(
    (d: 1 | -1) => {
      setP((cur) => {
        const next = cur + d;
        if (next < 0 || next >= total) return cur;
        setDir(d);
        onTurn?.();
        return next;
      });
    },
    [total, onTurn],
  );

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!tale) return null;
  const last = p === total - 1;
  const down = (e: PointerEvent) => {
    if (e.isPrimary) start.current = { x: e.clientX, y: e.clientY };
  };
  const up = (e: PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) go(dx < 0 ? 1 : -1);
  };

  return (
    <div className="tale" role="dialog" aria-modal="true" aria-label={tale.title.text ?? undefined} onPointerDown={down} onPointerUp={up}>
      <div className="tale__stage">
        <div key={p} className="tale__pic" data-dir={dir}>
          <TaleArt n={p} />
        </div>
        <button type="button" className="tale__zone tale__zone--prev" aria-label={ui("prevPage").text ?? ""} disabled={p === 0} onClick={() => go(-1)} />
        <button type="button" className="tale__zone tale__zone--next" aria-label={ui("nextPage").text ?? ""} disabled={last} onClick={() => go(1)} />
      </div>
      <div key={`t${p}`} className="tale__text" data-dir={dir}>
        <p className="tale__eyebrow">
          <Copy s={tale.title} badge={false} />
          <span lang="ko">
            <Copy s={tale.titleKo} badge={false} />
          </span>
        </p>
        <Copy s={tale.pages[p]!} as="p" className="tale__p" />
      </div>
      <footer className="tale__foot">
        <button type="button" className="tale__nav" onClick={() => go(-1)} disabled={p === 0} aria-label={ui("prevPage").text ?? ""}>
          <span aria-hidden="true">←</span>
        </button>
        <span className="tale__count" aria-live="polite">
          {fill(ui("pageOf").text ?? "", { n: p + 1, total })}
        </span>
        <button type="button" className="tale__nav" onClick={() => (last ? onClose() : go(1))} aria-label={(last ? ui("close") : ui("nextPage")).text ?? ""}>
          <span aria-hidden="true">{last ? "×" : "→"}</span>
        </button>
      </footer>
      <button ref={closeBtn} type="button" className="tale__close" onClick={onClose} aria-label={ui("close").text ?? ""}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
