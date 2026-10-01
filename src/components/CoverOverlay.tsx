import { type Chapter } from "../content";
import { Copy } from "./Copy";

/** The closed 3D book carries its own title, so the HTML only holds the accessible heading. */
export function CoverOverlay({ chapter }: { chapter: Chapter }) {
  return (
    <section className="cover cover--3d" aria-label={chapter.title.text ?? undefined}>
      <h1 className="sr-only">
        <Copy s={chapter.title} badge={false} />
      </h1>
    </section>
  );
}
