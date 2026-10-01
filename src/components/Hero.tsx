import { useState } from "react";
import { useDebug } from "../app/debug";
import type { Hotspot, Media } from "../content";
import { Placeholder } from "./Placeholder";

interface Props {
  media: Media;
  hotspots: Hotspot[];
  onHotspot: (h: Hotspot, trigger: HTMLElement) => void;
}

/** Hero frame with glowing hotspots. Each hotspot is a real button, so all are keyboard reachable. */
export function Hero({ media, hotspots, onHotspot }: Props) {
  const debug = useDebug();
  // If the image is missing (it is not in the public repo), show the labelled placeholder, never a broken image.
  const [failed, setFailed] = useState(false);
  const alt = media.alt.text ?? media.assetName;
  const focal = media.focal ? `${media.focal.x}% ${media.focal.y}%` : "50% 50%";
  return (
    <figure className={`hero hero--${media.aspect === "4:5" ? "4x5" : "16x9"}`}>
      <div className="hero__frame">
        {media.src && !failed ? (
          <img src={media.src} alt={alt} style={{ objectPosition: focal }} decoding="async" onError={() => setFailed(true)} />
        ) : (
          <Placeholder assetName={media.assetName} alt={alt} aspect={media.aspect} />
        )}
        {hotspots.map((h) => (
          <button
            key={h.id}
            type="button"
            className="hotspot"
            style={{ left: `${h.at.x}%`, top: `${h.at.y}%` }}
            aria-label={h.label.text ?? h.id}
            aria-haspopup="dialog"
            onClick={(e) => onHotspot(h, e.currentTarget)}
          >
            <span className="hotspot__dot" />
          </button>
        ))}
      </div>
      {debug && (
        <figcaption className="dbg-cap">
          {media.assetName} · {media.status}
          {media.note ? ` · ${media.note}` : ""}
        </figcaption>
      )}
    </figure>
  );
}
