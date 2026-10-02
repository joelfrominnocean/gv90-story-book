import { useEffect, useState } from "react";
import { useDebug } from "../app/debug";
import { Badge, Copy } from "../components/Copy";
import { content, ui } from "../content";

interface Props {
  sound: boolean;
  onSound: () => void;
}

/**
 * What sits over the listening room, and it is very little. The title and the one approved line are a card at the start: they are there
 * when you arrive, and they go (after a few seconds, or at your first touch), so the room is not stamped with a product name. The sound
 * switch is a small icon, not a word: the sound is for you to find at the turntable. Everything else the room has to say, it says
 * itself, near the thing it is about.
 */
export function RoomOverlay({ sound, onSound }: Props) {
  const debug = useDebug();
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const done = () => setIntro(false);
    const id = window.setTimeout(done, 4800);
    window.addEventListener("pointerdown", done, { once: true, capture: true });
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("pointerdown", done, { capture: true });
    };
  }, []);
  const label = (sound ? ui("soundOn") : ui("soundOff")).text ?? "";
  return (
    <section className="library library--3d library--wall library--room" data-intro={intro} aria-label={content.meta.bookTitle.text ?? undefined}>
      <header className="library__head">
        <h1 className="title">
          <Copy s={content.meta.bookTitle} />
        </h1>
      </header>
      <button type="button" className="library__sound room-sound" aria-pressed={sound} aria-label={label} title={label} onClick={onSound}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9.5h3.2L11.5 6v12L7.2 14.5H4z" />
          {sound ? (
            <>
              <path d="M15 9.2a4 4 0 0 1 0 5.6" />
              <path d="M17.6 6.8a7.4 7.4 0 0 1 0 10.4" />
            </>
          ) : (
            <path d="M15.2 9.6l4.4 4.8M19.6 9.6l-4.4 4.8" />
          )}
        </svg>
      </button>
      <p className="library__note">
        <Copy s={content.meta.sealedTeaser} />
        {debug && <Badge s={content.meta.sealedTeaser} />}
      </p>
    </section>
  );
}
