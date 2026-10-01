import { PAGE_H, PAGE_W, READING_FIT, TH_COVER } from "./constants";

/**
 * Pure animation and pose maths for one book (no three.js), so it is easy to reason about.
 *
 * A book is a cover plus `n` page leaves. Leaf indices: 0 = cover, 1..n = page 0..n-1.
 * `view` follows the app: -1 = closed on the cover, p = reading page p.
 * A leaf is "turned" (lying on the left) when it is behind the page being read.
 */
export const wantTurned = (leaf: number, view: number): boolean => (leaf === 0 ? view >= 0 : view >= leaf);

/** Total thickness of a closed book (covers included) for a given page count, so shelves look like a considered set. */
export const bookThickness = (pages: number): number => 0.17 + 0.004 * pages;

/**
 * Heights of the stacks for a book of n leaves. Thickness comes from `thickFor` (the page count the book
 * would have when unlocked), so a locked one-page book is as thick on the shelf as it will be once opened.
 */
export class Stack {
  readonly th: number;
  readonly total: number;
  readonly coverMidClosed: number;
  readonly coverMidOpen = TH_COVER / 2;
  constructor(
    readonly n: number,
    thickFor: number = n,
  ) {
    this.total = bookThickness(thickFor);
    this.th = (this.total - 2 * TH_COVER) / Math.max(1, n);
    this.coverMidClosed = TH_COVER + n * this.th + TH_COVER / 2;
  }
  /** Surface height of page c lying on the right stack. */
  zRight(c: number): number {
    return TH_COVER + (this.n - c) * this.th;
  }
  /** Surface height of page c lying on the left stack. */
  zLeft(c: number): number {
    return TH_COVER + (c + 1) * this.th;
  }
}

export interface LeafAnim {
  /** 0 = flat on the right, 1 = flat on the left. */
  p: number;
  from: number;
  to: number;
  start: number;
  dur: number;
  active: boolean;
}

/** Slow and deliberate: a soft start, then an ease-out. Nothing bouncy. */
export function ease(t: number): number {
  const soft = 0.5 - 0.5 * Math.cos(Math.PI * t);
  const out = 1 - Math.pow(1 - t, 3);
  return soft * 0.45 + out * 0.55;
}

/** Opening or closing the cover is a moment; turning a page while reading is quick. */
export const COVER_MS = 950;
export const PAGE_MS = 640;
export const FLURRY_MS = 520;
export const FLURRY_STAGGER_MS = 65;
/** How far the camera pulls back and tilts: a lot for the cover, a little for one page, some for a flurry. */
const PULL_COVER = 1;
const PULL_FLURRY = 0.55;
const PULL_PAGE = 0.3;

export class BookRig {
  leaves: LeafAnim[];
  /** 0 = settled framing, up to 1 = pulled back and tilted so the turn can be seen. */
  pull = 0;
  private pullLevel = PULL_PAGE;
  /** Debug: stop advancing so a mid-turn frame can be inspected. */
  frozen = false;
  private lastView = -1;

  constructor(readonly n: number) {
    this.leaves = Array.from({ length: n + 1 }, () => ({ p: 0, from: 0, to: 0, start: 0, dur: 1, active: false }));
  }

  /** Jump straight to a view with no animation (first paint). */
  snap(view: number): void {
    this.leaves.forEach((l, k) => {
      l.p = l.from = l.to = wantTurned(k, view) ? 1 : 0;
      l.active = false;
    });
    this.pull = 0;
    this.lastView = view;
  }

  /** Aim every leaf at the state for `view`. Several leaves turn in a quick, staggered flurry. */
  setView(view: number, now: number): void {
    const changed: number[] = [];
    this.leaves.forEach((l, k) => {
      const target = wantTurned(k, view) ? 1 : 0;
      const current = l.active ? l.to : Math.round(l.p);
      if (target !== current) changed.push(k);
    });
    const forward = view > this.lastView;
    changed.sort((a, b) => (forward ? a - b : b - a));
    const flurry = changed.length > 1;
    const coverMoves = changed.includes(0);
    this.pullLevel = coverMoves ? PULL_COVER : flurry ? PULL_FLURRY : PULL_PAGE;
    changed.forEach((k, rank) => {
      const l = this.leaves[k]!;
      l.from = l.p;
      l.to = wantTurned(k, view) ? 1 : 0;
      l.start = now + Math.min(rank * FLURRY_STAGGER_MS, 520);
      l.dur = k === 0 ? COVER_MS : flurry ? FLURRY_MS : PAGE_MS;
      l.active = true;
    });
    this.lastView = view;
  }

  /** True once every leaf has landed. */
  get landed(): boolean {
    return !this.leaves.some((l) => l.active);
  }

  /** Landed, and the camera is close enough to its reading pose that a live page can sit on the leaf without drifting. */
  get settled(): boolean {
    return this.landed && this.pull < 0.05;
  }

  /** Advance; returns true while anything is still moving. */
  update(now: number, dt: number): boolean {
    if (this.frozen) return false;
    for (const l of this.leaves) {
      if (!l.active) continue;
      const t = (now - l.start) / l.dur;
      if (t <= 0) l.p = l.from;
      else if (t >= 1) {
        l.p = l.to;
        l.active = false;
      } else l.p = l.from + (l.to - l.from) * ease(t);
    }
    const any = this.leaves.some((l) => l.active);
    const target = any ? this.pullLevel : 0;
    // Pull back quickly, settle back more gently (but briskly after an ordinary page turn).
    const tau = target > this.pull ? 0.17 : this.pullLevel < 0.4 ? 0.12 : 0.28;
    this.pull += (target - this.pull) * (1 - Math.exp(-dt / tau));
    if (!any && this.pull < 0.004) this.pull = 0;
    return any || this.pull > 0;
  }
}

/* ---------- leaf bending ---------- */

/** Fore-edge curl in radians as a function of turn progress: it leads on lift, trails on landing. */
export function curlFor(p: number): number {
  return 1.0 * Math.sin(2 * Math.PI * p) * (p < 0.5 ? 1 : 0.7);
}

/**
 * Centre line of a leaf hinged at the spine. `phi` is the hinge angle (0 flat right, PI flat left);
 * the angle grows (or shrinks) along the leaf by `curl`, which is what makes it curve.
 * Writes N+1 points into xs/zs, relative to the hinge.
 */
export function leafProfile(phi: number, curl: number, n: number, xs: Float32Array, zs: Float32Array): void {
  const ds = PAGE_W / n;
  let x = 0;
  let z = 0;
  xs[0] = 0;
  zs[0] = 0;
  for (let i = 1; i <= n; i++) {
    const s = (i - 0.5) / n;
    const a = phi + curl * Math.pow(s, 1.35);
    x += Math.cos(a) * ds;
    z += Math.sin(a) * ds;
    xs[i] = x;
    zs[i] = z;
  }
}

/* ---------- camera ---------- */

export interface Pose {
  /** Look-at point. */
  tx: number;
  ty: number;
  tz: number;
  /** Rotation about Z around the target, radians. 0 = camera south of the target. */
  az: number;
  /** Angle from straight down, radians. 0 = top-down. */
  polar: number;
  /** World height visible at the target's depth. */
  visH: number;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  tx: lerp(a.tx, b.tx, t),
  ty: lerp(a.ty, b.ty, t),
  tz: lerp(a.tz, b.tz, t),
  az: lerp(a.az, b.az, t),
  polar: lerp(a.polar, b.polar, t),
  visH: lerp(a.visH, b.visH, t),
});
export const smooth = (t: number): number => t * t * (3 - 2 * t);

/** How much taller the fully pulled-back view is than the reading view. */
const PULL_RATIO = 2.35;

/** `tz` is the surface height of the page being read, so the page always fills the same share of the screen. */
export function readingPose(tz: number): Pose {
  return { tx: PAGE_W / 2, ty: 0, tz, az: 0, polar: 0, visH: PAGE_H * READING_FIT };
}

export function pulledPose(): Pose {
  return { tx: 0.1, ty: -0.02, tz: TH_COVER, az: 0, polar: 0.66, visH: PAGE_H * READING_FIT * PULL_RATIO };
}

export function closedPose(aspect: number): Pose {
  // The closed book should sit comfortably inside a tall phone screen or a wider window.
  const visW = 1.22;
  const visH = Math.max(visW / aspect, PAGE_H * 1.12);
  return { tx: PAGE_W / 2 - 0.02, ty: -0.03, tz: TH_COVER, az: -0.2, polar: 0.82, visH };
}

/** `open` 0..1 is the cover's progress; `pull` 0..1 is the pulled-back amount. */
export function cameraPose(open: number, pull: number, aspect: number, readingZ: number): Pose {
  const base = lerpPose(closedPose(aspect), readingPose(readingZ), smooth(open));
  return lerpPose(base, pulledPose(), smooth(pull));
}

/* ---------- the library camera ---------- */

/** Looking at the shelf: nearly straight on, with a hair of angle for depth. */
export function libraryPose(aspect: number): Pose {
  const visW = 1.2;
  const visH = Math.max(visW / aspect, 2.5);
  return { tx: 0, ty: 0.5, tz: -0.6, az: -0.06, polar: 0.09, visH };
}
