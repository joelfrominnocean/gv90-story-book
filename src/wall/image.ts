import type { PlateRect } from "./layout";
import { layout } from "./layout";
import * as THREE from "three";

/** The wall picture's <img>, so the 3D book can borrow pixels from it. Set by WallPlate. */
export const plateImage: { el: HTMLImageElement | null } = { el: null };

/**
 * A crop of the picture at one book's spine, as a texture. The real book wears it for the first moments of the take-down,
 * so it looks like exactly the book that was in the picture, and only then turns into its own lit cloth.
 */
export function cropSpine(n: number): THREE.CanvasTexture | null {
  const img = plateImage.el;
  const r: PlateRect | undefined = layout.books[n];
  if (!img || !r || !img.complete || img.naturalWidth === 0) return null;
  const sx = r.u0 * img.naturalWidth;
  const sy = r.v0 * img.naturalHeight;
  const sw = Math.max(2, (r.u1 - r.u0) * img.naturalWidth);
  const sh = Math.max(2, (r.v1 - r.v0) * img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = Math.round(sw);
  c.height = Math.round(sh);
  c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
