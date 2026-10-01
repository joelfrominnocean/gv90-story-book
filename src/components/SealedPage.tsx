import { useDebug } from "../app/debug";
import { eyebrowFor } from "../book/pages";
import { content, ui, type Chapter, type UnlockState } from "../content";
import { Copy } from "./Copy";
import { Lamps } from "./Lamps";
import { MoonJar } from "./MoonJar";
import { PageTurners } from "./PageTurners";

interface Props {
  chapter: Chapter;
  state: UnlockState;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

/** A sealed page: never blank. Title, the approved teaser line, and the unlock date. */
export function SealedPage({ chapter, state, canPrev, canNext, onPrev, onNext }: Props) {
  const debug = useDebug();
  const teaser = chapter.sealedTeaser ?? content.meta.sealedTeaser;
  return (
    <article className="page page--sealed" aria-label={chapter.title.text ?? undefined}>
      <div className="sealed">
        <MoonJar sealed />
        <p className="eyebrow">
          <Copy s={eyebrowFor(chapter)} vars={{ n: chapter.n }} />
        </p>
        <h1 className="title">
          <Copy s={chapter.title} />
        </h1>
        <Lamps dim />
        <Copy s={teaser} as="p" className="teaser" />
        <p className="opens">
          <Copy s={ui("sealed")} />
          {" · "}
          {state.dateLabel ? <Copy s={ui("opensOn")} vars={{ date: state.dateLabel }} /> : <Copy s={ui("dateTbc")} />}
        </p>
        {debug && (
          <p className="dbg-meta">
            unlocked by: {chapter.unlockedBy.text}
            {chapter.unlock.placeholder ? " · placeholder date" : ""}
          </p>
        )}
      </div>
      <PageTurners canPrev={canPrev} canNext={canNext} onPrev={onPrev} onNext={onNext} />
    </article>
  );
}
