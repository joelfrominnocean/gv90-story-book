import { useEffect, useRef } from "react";
import { ui } from "../../content";
import { BadukBoard } from "./BadukBoard";
import { pointName } from "./engine";
import type { BadukState } from "./useBaduk";

interface Props {
  state: BadukState;
  onClose: () => void;
}

/**
 * The table, close up: the board seen from above, on dark walnut, with the room dimmed behind it. You play black; the opponent answers
 * after a moment. There is no score, no clock and no result: when you both pass, the game simply rests, and it is there again next time.
 * Three quiet words along the bottom (pass, a new game, close) and nothing else.
 */
export function BadukTable({ state, onClose }: Props) {
  const { game, yourTurn, thinking, over, playAt, passTurn, restart } = state;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<SVGElement>("svg.baduk")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const last = game.last >= 0 ? `${game.turn === 1 ? ui("badukWhite").text : ui("badukBlack").text} ${pointName(game.last, game.n)}` : game.last === -2 ? `${game.turn === 1 ? ui("badukWhite").text : ui("badukBlack").text} ${ui("badukPass").text}` : "";
  return (
    <div className="baduk-table" ref={root} onPointerDown={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={ui("roomCapBaduk").text ?? undefined}>
      <div className="baduk-table__top" data-thinking={thinking} aria-hidden="true">
        <i />
      </div>
      <div className="baduk-table__wood">
        <BadukBoard game={game} mode="play" canPlay={yourTurn} onPlay={playAt} label={ui("roomCapBaduk").text ?? undefined} />
      </div>
      <p className="baduk-table__rests" data-on={over}>
        {ui("badukRests").text}
      </p>
      <p className="sr-only" aria-live="polite">
        {last}
      </p>
      <div className="baduk-table__bar">
        <button type="button" onClick={passTurn} disabled={!yourTurn}>
          {ui("badukPass").text}
        </button>
        <button type="button" onClick={restart}>
          {ui("badukNew").text}
        </button>
        <button type="button" onClick={onClose}>
          {ui("close").text}
        </button>
      </div>
    </div>
  );
}
