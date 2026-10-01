import { useDebug } from "../app/debug";
import type { Rect } from "../book3d/Stage3D";
import { content, ui } from "../content";
import { Badge, Copy } from "./Copy";

interface Props {
  /** Where each book's spine is on screen. Empty until the shelf has drawn. */
  rects: Rect[];
  /** One accessible name per book. */
  labels: string[];
  /** A book is moving: the buttons wait. */
  busy: boolean;
  /** The fire's crackle. Off until the reader turns it on. */
  sound: boolean;
  onSound: () => void;
  onOpen: (n: number) => void;
}

/**
 * The library when the 3D shelf is showing. The shelf carries the books; the HTML holds the title, the one approved
 * line, and an invisible button over each spine, so the books are reachable by touch, keyboard and screen reader.
 */
export function LibraryOverlay({ rects, labels, busy, sound, onSound, onOpen }: Props) {
  const debug = useDebug();
  return (
    <section className="library library--3d" aria-label={content.meta.bookTitle.text ?? undefined}>
      <header className="library__head">
        <h1 className="title">
          <Copy s={content.meta.bookTitle} />
        </h1>
      </header>
      <button type="button" className="library__sound" aria-pressed={sound} onClick={onSound}>
        <Copy s={sound ? ui("soundOn") : ui("soundOff")} badge={false} />
      </button>
      <ul className="shelfbtns" inert={busy}>
        {labels.map((label, i) => {
          const r = rects[i];
          if (!r) return null;
          return (
            <li key={i} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
              <button type="button" className="shelfbtn" aria-label={label} onClick={() => onOpen(i)} />
            </li>
          );
        })}
      </ul>
      <p className="library__note">
        <Copy s={content.meta.sealedTeaser} />
        {debug && <Badge s={content.meta.sealedTeaser} />}
      </p>
    </section>
  );
}
