interface Props {
  assetName: string;
  alt: string;
  aspect: "4:5" | "16:9";
}

/** A labelled grey frame for any missing asset. Never stock imagery, never another vehicle. */
export function Placeholder({ assetName, alt, aspect }: Props) {
  return (
    <div className={`ph ph--${aspect === "4:5" ? "4x5" : "16x9"}`} role="img" aria-label={alt}>
      <svg className="ph__x" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="0" x2="100" y2="100" vectorEffect="non-scaling-stroke" />
        <line x1="100" y1="0" x2="0" y2="100" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="ph__label">
        <b>Placeholder</b>
        {assetName}
      </span>
    </div>
  );
}
