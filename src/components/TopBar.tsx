import { ui } from "../content";
import { Copy } from "./Copy";
import { fill } from "../content";

interface Props {
  /** Zero-based page being read. */
  page: number;
  total: number;
  onLibrary: () => void;
}

/** A thin progress line through the book, and the way back to the library. Replaces the chapter rail. */
export function TopBar({ page, total, onLibrary }: Props) {
  const label = fill(ui("pageOf").text ?? "", { n: page + 1, total });
  return (
    <nav className="topbar">
      <div className="topbar__line" role="progressbar" aria-label={label} aria-valuemin={1} aria-valuemax={total} aria-valuenow={page + 1}>
        <span style={{ transform: `scaleX(${(page + 1) / total})` }} />
      </div>
      <button type="button" className="topbar__library" onClick={onLibrary}>
        <Copy s={ui("library")} badge={false} />
      </button>
    </nav>
  );
}
