import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Urbanist is the nearest Google font to Genesis Sans (Head, light and uppercase-friendly; Text, regular and medium): the widths and
// x-height measured on genesis.com agree to within about 1.5%. See README.
import "@fontsource/urbanist/300.css";
import "@fontsource/urbanist/400.css";
import "@fontsource/urbanist/500.css";
import "@fontsource/urbanist/600.css";
import "@fontsource/urbanist/400-italic.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/book.css";

const root = createRoot(document.getElementById("root")!);

// content.json is validated when ./content loads. If a string is malformed we show exactly where,
// instead of a blank screen.
import("./app/App")
  .then(({ default: App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
  .catch((err: unknown) => {
    const issues =
      err && typeof err === "object" && "issues" in err
        ? (err as { issues: { path: PropertyKey[]; message: string }[] }).issues.map(
            (i) => `${i.path.map(String).join(" › ")}: ${i.message}`,
          )
        : [err instanceof Error ? err.message : String(err)];
    root.render(
      <main className="content-error">
        <h1>content.json is not valid</h1>
        <ul>
          {issues.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </main>,
    );
  });
