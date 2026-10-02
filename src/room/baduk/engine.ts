/**
 * The rules of Baduk (Go), and nothing else: a board, a legal-move test, captures, the ko rule, passing. No score is kept or shown (this is
 * a game left on a table, not a contest), but `areaScore` exists for the opponent, which has to judge positions to play sensibly.
 *
 * Rules implemented: stones with no liberties are captured; a move that would leave its own group without liberties is illegal unless
 * it captures; the simple ko rule (you may not at once retake a single stone that has just taken a single stone of yours); two passes in
 * a row end the game. The board is square and any size from 5 to 19; the room uses 9, which is a real board and fits a thumb.
 */

export type Colour = 1 | 2; // 1 black, 2 white
export const BLACK: Colour = 1;
export const WHITE: Colour = 2;
export const other = (c: Colour): Colour => (c === 1 ? 2 : 1);

export interface Game {
  n: number;
  /** n*n points, row by row from the top left: 0 empty, 1 black, 2 white. */
  board: Uint8Array;
  turn: Colour;
  /** The one point that may not be played this turn because of ko, or -1. */
  ko: number;
  /** Passes in a row. Two ends the game. */
  passes: number;
  /** The last move: a point, -1 for none yet, -2 for a pass. */
  last: number;
  /** Points whose stones were taken by the last move (for a quiet fade-out). */
  taken: number[];
}

const NEIGHBOURS = new Map<number, number[][]>();
/** For each point, the orthogonal neighbours that are on the board. */
export function neighbours(n: number): number[][] {
  let t = NEIGHBOURS.get(n);
  if (!t) {
    t = [];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const l: number[] = [];
        if (y > 0) l.push((y - 1) * n + x);
        if (x > 0) l.push(y * n + x - 1);
        if (x < n - 1) l.push(y * n + x + 1);
        if (y < n - 1) l.push((y + 1) * n + x);
        t.push(l);
      }
    NEIGHBOURS.set(n, t);
  }
  return t;
}

export function newGame(n = 9): Game {
  return { n, board: new Uint8Array(n * n), turn: BLACK, ko: -1, passes: 0, last: -1, taken: [] };
}

export const cloneGame = (g: Game): Game => ({ ...g, board: g.board.slice(), taken: g.taken.slice() });

/** The group of same-coloured stones containing point `i`, and its liberties. */
export function group(board: Uint8Array, n: number, i: number): { stones: number[]; liberties: number[] } {
  const colour = board[i]!;
  const nb = neighbours(n);
  const seen = new Uint8Array(n * n);
  const stones: number[] = [];
  const libs: number[] = [];
  const libSeen = new Uint8Array(n * n);
  const stack = [i];
  seen[i] = 1;
  while (stack.length) {
    const p = stack.pop()!;
    stones.push(p);
    for (const q of nb[p]!) {
      const v = board[q]!;
      if (v === 0) {
        if (!libSeen[q]) {
          libSeen[q] = 1;
          libs.push(q);
        }
      } else if (v === colour && !seen[q]) {
        seen[q] = 1;
        stack.push(q);
      }
    }
  }
  return { stones, liberties: libs };
}

/**
 * Plays `colour` at point `i` on a board. Returns what that does, or null if it is not legal. `ko` is the forbidden point (or -1).
 * This is the one place the rules live; the game and the opponent's playouts both use it.
 */
export function tryPlay(board: Uint8Array, n: number, i: number, colour: Colour, ko: number): { board: Uint8Array; taken: number[]; ko: number } | null {
  if (i < 0 || i >= n * n || board[i] !== 0 || i === ko) return null;
  const b = board.slice();
  b[i] = colour;
  const nb = neighbours(n);
  const foe = other(colour);
  const taken: number[] = [];
  const checked = new Set<number>();
  for (const q of nb[i]!) {
    if (b[q] !== foe || checked.has(q)) continue;
    const g = group(b, n, q);
    for (const s of g.stones) checked.add(s);
    if (g.liberties.length === 0) for (const s of g.stones) taken.push(s);
  }
  for (const s of taken) b[s] = 0;
  const mine = group(b, n, i);
  if (mine.liberties.length === 0) return null; // suicide (a capture would have given it a liberty)
  // ko: one stone taken by a lone stone that is left with exactly one liberty, which is the point just emptied
  const newKo = taken.length === 1 && mine.stones.length === 1 && mine.liberties.length === 1 ? taken[0]! : -1;
  return { board: b, taken, ko: newKo };
}

export const isLegal = (g: Game, i: number): boolean => g.passes < 2 && tryPlay(g.board, g.n, i, g.turn, g.ko) !== null;

/** Plays a move for whoever's turn it is. Returns the new game, or null if the move is not legal. */
export function play(g: Game, i: number): Game | null {
  if (g.passes >= 2) return null;
  const r = tryPlay(g.board, g.n, i, g.turn, g.ko);
  if (!r) return null;
  return { n: g.n, board: r.board, turn: other(g.turn), ko: r.ko, passes: 0, last: i, taken: r.taken };
}

export function pass(g: Game): Game {
  return { n: g.n, board: g.board, turn: other(g.turn), ko: -1, passes: g.passes + 1, last: -2, taken: [] };
}

export const isOver = (g: Game): boolean => g.passes >= 2;

/** Area score by the simple (Chinese / Tromp-Taylor) count: a colour's stones plus the empty regions bordered only by that colour. Used by the opponent only. */
export function areaScore(board: Uint8Array, n: number): { black: number; white: number } {
  const nb = neighbours(n);
  let black = 0;
  let white = 0;
  const seen = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const v = board[i]!;
    if (v === 1) black++;
    else if (v === 2) white++;
    else if (!seen[i]) {
      let size = 0;
      let touchB = false;
      let touchW = false;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const p = stack.pop()!;
        size++;
        for (const q of nb[p]!) {
          const w = board[q]!;
          if (w === 0) {
            if (!seen[q]) {
              seen[q] = 1;
              stack.push(q);
            }
          } else if (w === 1) touchB = true;
          else touchW = true;
        }
      }
      if (touchB && !touchW) black += size;
      else if (touchW && !touchB) white += size;
    }
  }
  return { black, white };
}

/** An empty point surrounded by one colour's stones, which that colour should never fill (it would throw away a liberty of its own). */
export function isOwnEye(board: Uint8Array, n: number, i: number, colour: Colour): boolean {
  if (board[i] !== 0) return false;
  const nb = neighbours(n);
  for (const q of nb[i]!) if (board[q] !== colour) return false;
  const x = i % n;
  const y = (i - x) / n;
  let bad = 0;
  let onEdge = false;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const xx = x + dx;
    const yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= n || yy >= n) {
      onEdge = true;
      continue;
    }
    if (board[yy * n + xx] !== colour) bad++;
  }
  return onEdge ? bad === 0 : bad <= 1;
}

/** "D4"-style names for a point, skipping the letter I as Go boards do, with row 1 at the bottom. */
export function pointName(i: number, n: number): string {
  const x = i % n;
  const y = (i - x) / n;
  const letters = "ABCDEFGHJKLMNOPQRST";
  return `${letters[x]}${n - y}`;
}

/** A position that looks like a game that has been going a while: eight moves, no captures, black to play. */
export const OPENING_9: number[] = [
  6 * 1 + 2 * 9, // black  G7
  2 + 2 * 9, //      white  C7
  2 + 6 * 9, //      black  C3
  6 + 6 * 9, //      white  G3
  5 + 4 * 9, //      black  F5
  3 + 3 * 9, //      white  D6
  4 + 6 * 9, //      black  E3
  3 + 5 * 9, //      white  D4
];

/** The game as it stands after the opening and then `moves` (a point each, or -1 for a pass). The room saves only `moves`. */
export function replay(moves: number[], n = 9): Game {
  let g = newGame(n);
  for (const m of n === 9 ? OPENING_9 : []) g = play(g, m) ?? g;
  for (const m of moves) {
    const next = m === -1 ? pass(g) : play(g, m);
    if (!next) break; // a saved game that no longer makes sense stops where it stopped making sense
    g = next;
  }
  return g;
}
