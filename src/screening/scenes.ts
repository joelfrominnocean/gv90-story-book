import type { Chapter } from "../content";

/**
 * A chapter is a screening: a run of scenes you move through by tapping. Each scene is one thing on one frame, in the order the
 * chapter's own content already has:
 *   frame    a hero picture or film, full bleed; the first one carries the chapter's title
 *   line     one line of the chapter's copy, fading in over the picture (never split, never reworded)
 *   details  the picture, framed, with its quiet marks (the car details you can touch)
 *   film     the chapter's film, behind a single play mark
 *   close    the quiet call to action
 *   sealed   a chapter that has not arrived yet: a dark frame, its title and the date
 * `hero` is which of the chapter's pictures sits behind the scene.
 */
export type Scene =
  | { kind: "frame"; hero: number; first: boolean }
  | { kind: "line"; hero: number; module: number; beat: number }
  | { kind: "details"; hero: number }
  | { kind: "film"; hero: number }
  | { kind: "close"; hero: number }
  | { kind: "sealed" };

export function buildScenes(ch: Chapter, open: boolean): Scene[] {
  if (!open) return [{ kind: "sealed" }];
  const scenes: Scene[] = [];
  ch.heroes.forEach((_, i) => scenes.push({ kind: "frame", hero: i, first: i === 0 }));
  ch.modules.forEach((m, mi) => m.beats.forEach((_, bi) => scenes.push({ kind: "line", hero: 0, module: mi, beat: bi })));
  if (ch.hotspots.length) scenes.push({ kind: "details", hero: 0 });
  if (ch.video) scenes.push({ kind: "film", hero: 0 });
  scenes.push({ kind: "close", hero: 0 });
  return scenes;
}

/** A hero that is a film rather than a still. */
export const isFilm = (src: string | null): boolean => !!src && /\.(mp4|webm|mov)(\?.*)?$/i.test(src);
