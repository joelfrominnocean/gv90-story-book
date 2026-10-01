import { useState, type ReactNode } from "react";
import { useDebug } from "../app/debug";
import { fill, type Str } from "../content";

const SHORT = { "brief-approved": "approved", "brief-draft": "draft", generated: "gen" } as const;

/** Source badge shown under ?debug=1. Tap it for provenance, flags and notes. */
export function Badge({ s }: { s: Str }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`dbg dbg--${s.source}`}>
      <button
        type="button"
        className="dbg__tag"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {SHORT[s.source]}
        {s.flags?.length ? " ⚠" : ""}
        {s.text === null ? " ∅" : ""}
      </button>
      {open && (
        <span className="dbg__detail" role="note">
          <b>{s.source}</b>
          {s.text === null && " · pending"}
          {s.ref && <span>ref: {s.ref}</span>}
          {s.flags?.length ? <span>flags: {s.flags.join(", ")}</span> : null}
          {s.note && <span>note: {s.note}</span>}
        </span>
      )}
    </span>
  );
}

type Tag = "span" | "p" | "h1" | "h2" | "div" | "small" | "figcaption" | "blockquote";

interface CopyProps {
  s: Str;
  as?: Tag;
  className?: string;
  /** Fill {tokens} in the string. */
  vars?: Record<string, string | number>;
  /** Set false inside links/buttons and render <Badge> beside them instead. */
  badge?: boolean;
  children?: ReactNode;
}

/**
 * The only way a string reaches the screen. Null text becomes a labelled placeholder,
 * never an empty gap and never invented words.
 */
export function Copy({ s, as: Tag = "span", className, vars, badge = true }: CopyProps) {
  const debug = useDebug();
  return (
    <Tag className={className} data-source={s.source}>
      {s.text === null ? (
        <span className="pending">
          <b>Copy pending</b>
          {s.ref ? ` · ${s.ref}` : ""}
        </span>
      ) : (
        fill(s.text, vars)
      )}
      {debug && badge && <Badge s={s} />}
    </Tag>
  );
}
