import { useEffect, useId, useRef } from "react";
import { ui, type Chapter, type Hotspot } from "../content";
import { Copy } from "./Copy";

interface Props {
  chapter: Chapter;
  hotspot: Hotspot;
  onClose: () => void;
  onPlay: () => void;
}

const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";

/** Bottom sheet: one line of copy and a play button. Escape or a tap outside closes it. */
export function HotspotSheet({ chapter, hotspot, onClose, onPlay }: Props) {
  const sheet = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !sheet.current) return;
      const items = [...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canPlay = hotspot.kind === "info" && chapter.video !== null;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <section ref={sheet} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="sheet__head">
          <h2 id={titleId} className="sheet__label">
            <Copy s={hotspot.label} />
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={ui("close").text ?? undefined} data-autofocus>
            <span className="icon-x" aria-hidden="true" />
          </button>
        </header>
        <Copy s={hotspot.line} as="p" className="sheet__line" />
        {hotspot.kind !== "info" && (
          <p className="stub">
            <b>Placeholder</b>
            {hotspot.kind === "picker" ? "Colour and trim picker" : "Event RSVP"} is not built yet. No options or event details have been supplied.
          </p>
        )}
        {canPlay && (
          <button type="button" className="play" onClick={onPlay}>
            <span className="watch__icon" aria-hidden="true" />
            <Copy s={ui("play")} badge={false} />
          </button>
        )}
      </section>
    </>
  );
}
