import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chooseMove } from "./ai";
import { BLACK, WHITE, isOver, play, replay, type Game } from "./engine";

const KEY = "gv90.room.baduk";

const load = (): number[] => {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)).slice(0, 400) : [];
  } catch {
    return [];
  }
};
const save = (moves: number[]) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(moves));
  } catch {
    /* private mode: the game just starts again next time */
  }
};

export interface BadukState {
  game: Game;
  /** It is your turn (you play black) and the game is not over. */
  yourTurn: boolean;
  /** The opponent is thinking. */
  thinking: boolean;
  over: boolean;
  playAt: (point: number) => boolean;
  passTurn: () => void;
  restart: () => void;
}

/**
 * A game of Baduk left on the table. You play black; the opponent plays white after a short, human pause. The game is kept in the
 * browser (only the moves after the opening, as a short list), so it is still there, mid-game, the next time you come to the room.
 * `onStone(colour, taken)` is called for every stone placed, so the room can make the sound of it.
 */
export function useBaduk(onStone?: (colour: 1 | 2, taken: number) => void): BadukState {
  const [moves, setMoves] = useState<number[]>(load);
  const game = useMemo(() => replay(moves), [moves]);
  const [thinking, setThinking] = useState(false);
  const token = useRef(0);
  const stone = useRef(onStone);
  stone.current = onStone;

  useEffect(() => save(moves), [moves]);

  const yourTurn = game.turn === BLACK && !isOver(game) && !thinking;

  const playAt = useCallback(
    (point: number) => {
      if (game.turn !== BLACK || isOver(game)) return false;
      const next = play(game, point);
      if (!next) return false;
      stone.current?.(BLACK, next.taken.length);
      setMoves((m) => [...m, point]);
      return true;
    },
    [game],
  );
  const passTurn = useCallback(() => {
    if (game.turn !== BLACK || isOver(game)) return;
    setMoves((m) => [...m, -1]);
  }, [game]);
  const restart = useCallback(() => {
    token.current++;
    setThinking(false);
    setMoves([]);
  }, []);

  // the opponent's turn: it thinks for a moment, never less than a beat, so the reply feels like a person's and not a reflex
  useEffect(() => {
    if (game.turn !== WHITE || isOver(game)) return;
    const mine = ++token.current;
    setThinking(true);
    const started = performance.now();
    const beat = 650 + Math.random() * 600;
    void chooseMove(game, WHITE).then(async (mv) => {
      const wait = beat - (performance.now() - started);
      if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
      if (mine !== token.current) return;
      if (mv >= 0) {
        const next = play(game, mv);
        stone.current?.(WHITE, next?.taken.length ?? 0);
      }
      setThinking(false);
      setMoves((m) => [...m, mv >= 0 ? mv : -1]);
    });
    return () => {
      token.current++;
      setThinking(false);
    };
  }, [game]);

  return { game, yourTurn, thinking, over: isOver(game), playAt, passTurn, restart };
}

