import { ui, type Chapter } from "../content";
import { Copy } from "./Copy";
import { Lamps } from "./Lamps";
import { MoonJar } from "./MoonJar";

/** Five holes along the spine. A nod to stitched binding only; creative to verify the reference. */
const STITCHES = [14, 32, 50, 68, 86];

/** The 2D cover: shown briefly as a book is taken down, before it opens. (The 3D book carries its own cover.) */
export function Cover({ chapter }: { chapter: Chapter }) {
  return (
    <section className="cover" aria-label={chapter.title.text ?? undefined}>
      <div className="spine" aria-hidden="true">
        {STITCHES.map((top) => (
          <i key={top} style={{ top: `${top}%` }} />
        ))}
      </div>
      <div className="cover__body">
        <MoonJar size="large" />
        <h1 className="cover__title">
          <Copy s={chapter.title} />
        </h1>
        <Lamps loading />
        <p className="cover__loading" role="status">
          <Copy s={ui("loading")} />
        </p>
      </div>
    </section>
  );
}
