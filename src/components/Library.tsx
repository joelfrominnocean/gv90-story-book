import { content, ui, unlockState, fill } from "../content";
import { eyebrowFor } from "../book/pages";
import { Copy } from "./Copy";
import { MoonJar } from "./MoonJar";

/**
 * The library, for now as a plain chooser: one row per book, sealed books marked with their date.
 * (The shelf replaces this in the next step; the way a book is chosen and opened stays the same.)
 */
export function Library({ preview, onOpen }: { preview: boolean; onOpen: (n: number) => void }) {
  return (
    <section className="library" aria-label={content.meta.bookTitle.text ?? undefined}>
      <header className="library__head">
        <MoonJar />
        <h1 className="title">
          <Copy s={content.meta.bookTitle} />
        </h1>
      </header>
      <ul className="library__list">
        {content.chapters.map((ch) => {
          const state = unlockState(ch, preview);
          return (
            <li key={ch.id}>
              <button type="button" className="libitem" data-sealed={state.open ? "false" : "true"} onClick={() => onOpen(ch.n)}>
                <span className="libitem__eyebrow">
                  <Copy s={eyebrowFor(ch)} vars={{ n: ch.n }} badge={false} />
                </span>
                <span className="libitem__title">
                  <Copy s={ch.title} badge={false} />
                </span>
                {!state.open && (
                  <span className="libitem__state">
                    <Copy s={ui("sealed")} badge={false} />
                    {" · "}
                    {state.dateLabel ? fill(ui("opensOn").text ?? "", { date: state.dateLabel }) : ui("dateTbc").text}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
