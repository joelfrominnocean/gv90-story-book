import { areaScore, group, isOwnEye, neighbours, other, tryPlay, type Colour, type Game } from "./engine";

/**
 * The opponent: a gentle player, not a strong one. It looks at every legal move, gives each a score from the things a beginner learns
 * first (take what can be taken, save what is in danger, do not put your own stones in danger, play on the third and fourth lines early,
 * stay near the last move), keeps the best few, and tries each with a handful of quick random games to see which holds up. On a 9x9
 * board that takes about half a second and is enough to punish carelessness without ever being a lecture. It never shows or keeps a score.
 */

const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));
const KOMI = 5.5;

/** One quick random game from a position, played out to the end; true if `colour` wins on area. */
function playout(board: Uint8Array, n: number, toMove: Colour, ko: number, colour: Colour): boolean {
  let b = board;
  let turn = toMove;
  let passes = 0;
  let koPoint = ko;
  const size = n * n;
  const limit = Math.floor(size * 1.5);
  for (let m = 0; m < limit && passes < 2; m++) {
    const start = Math.floor(Math.random() * size);
    let played = false;
    for (let k = 0; k < size; k++) {
      const i = (start + k) % size;
      if (b[i] !== 0 || i === koPoint) continue;
      if (isOwnEye(b, n, i, turn)) continue;
      const r = tryPlay(b, n, i, turn, koPoint);
      if (!r) continue;
      b = r.board;
      koPoint = r.ko;
      played = true;
      break;
    }
    if (played) passes = 0;
    else {
      passes++;
      koPoint = -1;
    }
    turn = other(turn);
  }
  const s = areaScore(b, n);
  const whiteWins = s.white + KOMI > s.black;
  return colour === 2 ? whiteWins : !whiteWins;
}

interface Candidate {
  i: number;
  h: number;
  after: Uint8Array;
  ko: number;
  win: number;
}

function heuristic(g: Game, i: number, colour: Colour, r: { board: Uint8Array; taken: number[] }): number {
  const n = g.n;
  const nb = neighbours(n);
  const foe = other(colour);
  const x = i % n;
  const y = (i - x) / n;
  let h = 0;
  if (r.taken.length) h += 55 + 25 * r.taken.length;
  const mine = group(r.board, n, i);
  if (mine.liberties.length === 1 && r.taken.length === 0) h -= 80; // a move into self-atari
  if (mine.liberties.length >= 3) h += 3;
  const done = new Set<number>();
  for (const q of nb[i]!) {
    if (g.board[q] === colour && !done.has(q)) {
      const before = group(g.board, n, q);
      for (const s of before.stones) done.add(s);
      if (before.liberties.length === 1 && mine.liberties.length >= 2) h += 40 + 8 * before.stones.length; // saves a group in atari
    }
    if (r.board[q] === foe && !done.has(q)) {
      const after = group(r.board, n, q);
      for (const s of after.stones) done.add(s);
      if (after.liberties.length === 1 && mine.liberties.length >= 2) h += 22; // puts a group in atari
    }
  }
  const stones = g.board.reduce((a, v) => a + (v ? 1 : 0), 0);
  const edge = Math.min(x, y, n - 1 - x, n - 1 - y);
  if (stones < 3 * n) h += edge === 2 || edge === 3 ? 9 : edge === 0 ? -14 : edge === 1 ? -4 : 2;
  if (g.last >= 0) {
    const lx = g.last % n;
    const ly = (g.last - lx) / n;
    const d = Math.abs(x - lx) + Math.abs(y - ly);
    h += d <= 2 ? 10 : d <= 4 ? 4 : 0;
  }
  if (nb[i]!.some((q) => g.board[q] !== 0)) h += 3;
  return h + Math.random() * 4;
}

/** The opponent's move for `colour`: a point, or -1 for a pass. Takes a moment, in small steps, so the page never stalls. */
export async function chooseMove(g: Game, colour: Colour, playouts = 36, keep = 8): Promise<number> {
  const n = g.n;
  const cands: Candidate[] = [];
  for (let i = 0; i < n * n; i++) {
    const r = tryPlay(g.board, n, i, colour, g.ko);
    if (!r) continue;
    if (r.taken.length === 0 && isOwnEye(g.board, n, i, colour)) continue;
    cands.push({ i, h: heuristic(g, i, colour, r), after: r.board, ko: r.ko, win: 0 });
  }
  if (!cands.length) return -1;
  cands.sort((a, b) => b.h - a.h);
  const top = cands.slice(0, keep);
  for (const c of top) {
    let wins = 0;
    for (let p = 0; p < playouts; p++) if (playout(c.after, n, other(colour), c.ko, colour)) wins++;
    c.win = wins / playouts;
    await yieldNow();
  }
  top.sort((a, b) => b.win * 100 + b.h * 0.35 - (a.win * 100 + a.h * 0.35));
  const best = top[0]!;
  // if you have just passed and I am clearly ahead, I pass too, and the game rests
  if (g.passes === 1 && best.win > 0.72) return -1;
  return best.i;
}
