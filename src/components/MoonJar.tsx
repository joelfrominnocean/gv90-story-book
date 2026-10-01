/**
 * The recurring motif: an asymmetric, slightly imperfect circle in a single brush-like stroke.
 * The path overshoots its start so the stroke reads as hand-drawn, not geometric.
 */
export function MoonJar({ size = "default", sealed = false }: { size?: "default" | "large"; sealed?: boolean }) {
  return (
    <svg
      className={`jar${size === "large" ? " jar--large" : ""}${sealed ? " jar--sealed" : ""}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <path
        pathLength="1"
        d="M52 9 C78 6 94 28 92 53 C90 78 69 95 45 92 C21 89 6 69 9 45 C12 23 31 8 56 11 C60 11.5 63 12.5 66 14"
      />
    </svg>
  );
}
