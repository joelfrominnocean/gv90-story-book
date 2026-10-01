import raw from "./layout.json";

/** A rectangle on the wall plate, as fractions of its width and height from the top-left. */
export interface PlateRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

interface Layout {
  /** Width over height of the plate. */
  aspect: number;
  /** Where each of our six spines is. */
  books: PlateRect[];
  /** The fireplace opening. */
  fire: PlateRect;
  /** The shelf the six stand on, with a little margin. */
  bay: PlateRect;
  /** The picture of the plate with book n missing, cut to this rectangle, for while the real book is off the shelf. */
  patches: PlateRect[];
}

/** Written by `node scripts/make-wall-assets.mjs` from the Blender render (scripts/blender/render_wall.sh). */
export const layout = raw as Layout;

/** CSS left/top/width/height as percentages of the plate. */
export function rectStyle(r: PlateRect, grow = 0): { left: string; top: string; width: string; height: string } {
  const w = r.u1 - r.u0;
  const h = r.v1 - r.v0;
  return {
    left: `${(r.u0 - w * grow) * 100}%`,
    top: `${(r.v0 - h * grow) * 100}%`,
    width: `${w * (1 + 2 * grow) * 100}%`,
    height: `${h * (1 + 2 * grow) * 100}%`,
  };
}
