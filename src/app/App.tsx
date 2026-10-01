import { useEffect, useMemo } from "react";
import { content } from "../content";
import { Book } from "./Book";
import { DebugProvider } from "./debug";
import { readRoute } from "./useRoute";

export default function App() {
  const route = useMemo(readRoute, []);
  useEffect(() => {
    document.title = content.meta.bookTitle.text ?? "GV90";
  }, []);
  return (
    <DebugProvider value={route.debug}>
      <Book route={route} />
    </DebugProvider>
  );
}
