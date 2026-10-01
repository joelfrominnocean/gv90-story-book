import { useState } from "react";
import type { Route } from "../app/useRoute";
import { content } from "../content";

interface Props {
  route: Route;
  view: string;
  open: boolean;
  mode: string;
}

/** ?debug=1 only: current state, badge legend, the open flags from the brief, and source links. */
export function DebugPanel({ route, view, open, mode }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <aside className="debugpanel">
      <button type="button" className="debugpanel__pill" aria-expanded={shown} onClick={() => setShown((s) => !s)}>
        debug · {mode} · {view}
        {route.preview ? " · preview" : ""}
        {route.ryi ? " · ryi" : ""}
        {!open ? " · sealed" : ""}
      </button>
      {shown && (
        <div className="debugpanel__body">
          <p className="debugpanel__legend">
            <span className="dbg dbg--brief-approved"><b className="dbg__tag">approved</b></span> verbatim, signed off
            <br />
            <span className="dbg dbg--brief-draft"><b className="dbg__tag">draft</b></span> verbatim, placeholder until signed off
            <br />
            <span className="dbg dbg--generated"><b className="dbg__tag">gen</b></span> written for the build, creative to replace
            <br />⚠ spec/fact claim to verify · ∅ copy pending
          </p>
          <h3>Open flags</h3>
          <ul>
            {content.meta.openFlags.map((f) => (
              <li key={f.id}>
                <b>{f.id}</b> {f.note}
              </li>
            ))}
          </ul>
          <h3>Sources (links only, nothing downloaded)</h3>
          <ul>
            {content.meta.sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
