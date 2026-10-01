/**
 * 3D is the default. It falls back to the 2D book (same content, crossfades) when:
 *  - the reader prefers reduced motion (page curls become crossfades),
 *  - WebGL is unavailable, or the device looks low-powered.
 * `?3d=0` forces 2D and `?3d=1` forces 3D (when WebGL exists), for review and testing.
 */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function detect3d(search: string): boolean {
  const flag = new URLSearchParams(search).get("3d");
  if (flag === "0") return false;
  if (flag === "1") return webglAvailable();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if ((navigator.hardwareConcurrency ?? 8) <= 2) return false;
  return webglAvailable();
}
