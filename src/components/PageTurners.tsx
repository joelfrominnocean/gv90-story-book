import { ui } from "../content";
import { Copy } from "./Copy";

/** Visually hidden until focused: keyboard and screen-reader route to turn pages. */
export function PageTurners({ canPrev, canNext, onPrev, onNext }: { canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="turners">
      {canPrev && (
        <button type="button" className="turners__btn" onClick={onPrev}>
          <Copy s={ui("prevPage")} badge={false} />
        </button>
      )}
      {canNext && (
        <button type="button" className="turners__btn" onClick={onNext}>
          <Copy s={ui("nextPage")} badge={false} />
        </button>
      )}
    </div>
  );
}
