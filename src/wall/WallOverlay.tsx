import { useDebug } from "../app/debug";
import { Badge, Copy } from "../components/Copy";
import { content, ui } from "../content";

interface Props {
  /** The fire's crackle. Off until the reader turns it on. */
  sound: boolean;
  onSound: () => void;
  /** True while the whole wall is showing: the button then offers the way back in. */
  zoomedOut: boolean;
  onZoom: () => void;
}

/** What sits over the wall: the title, the one approved line, the sound switch, and the way to see the whole wall. */
export function WallOverlay({ sound, onSound, zoomedOut, onZoom }: Props) {
  const debug = useDebug();
  return (
    <section className="library library--3d library--wall" aria-label={content.meta.bookTitle.text ?? undefined}>
      <header className="library__head">
        <h1 className="title">
          <Copy s={content.meta.bookTitle} />
        </h1>
      </header>
      <button type="button" className="library__zoom" onClick={onZoom}>
        <Copy s={zoomedOut ? ui("wallFocus") : ui("wallOverview")} badge={false} />
      </button>
      <button type="button" className="library__sound" aria-pressed={sound} onClick={onSound}>
        <Copy s={sound ? ui("soundOn") : ui("soundOff")} badge={false} />
      </button>
      <p className="library__note">
        <Copy s={content.meta.sealedTeaser} />
        {debug && <Badge s={content.meta.sealedTeaser} />}
      </p>
    </section>
  );
}
