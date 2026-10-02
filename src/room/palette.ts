/** The room moves from late afternoon to night as the sends go out: t = 0 with one chapter open, 1 with all six. */
export interface Palette {
  skyTop: string;
  skyBottom: string;
  far: string;
  mid: string;
  near: string;
  moon: number;
  /** Darkness laid over the room (0..1). */
  night: number;
  /** Strength of the lamp's light. */
  lamp: number;
}

const DAY: Palette = { skyTop: "#6b86a6", skyBottom: "#efc597", far: "#7b8aa6", mid: "#5d6985", near: "#3f465c", moon: 0, night: 0.04, lamp: 0.32 };
const NIGHT: Palette = { skyTop: "#060b1d", skyBottom: "#1f2d57", far: "#141d3b", mid: "#0e1531", near: "#080c1c", moon: 1, night: 0.4, lamp: 0.85 };

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
export const mix = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  const h = (x: number) => Math.round(x).toString(16).padStart(2, "0");
  return `#${h(r1 + (r2 - r1) * t)}${h(g1 + (g2 - g1) * t)}${h(b1 + (b2 - b1) * t)}`;
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function paletteFor(open: number, total = 6): Palette {
  const t = Math.min(1, Math.max(0, (open - 1) / Math.max(1, total - 1)));
  return {
    skyTop: mix(DAY.skyTop, NIGHT.skyTop, t),
    skyBottom: mix(DAY.skyBottom, NIGHT.skyBottom, t),
    far: mix(DAY.far, NIGHT.far, t),
    mid: mix(DAY.mid, NIGHT.mid, t),
    near: mix(DAY.near, NIGHT.near, t),
    moon: lerp(DAY.moon, NIGHT.moon, t),
    night: lerp(DAY.night, NIGHT.night, t),
    lamp: lerp(DAY.lamp, NIGHT.lamp, t),
  };
}
