import { useEffect, useMemo } from "react";
import { content } from "../content";
import { Book } from "./Book";
import { Experience } from "./Experience";
import { DebugProvider } from "./debug";
import { readRoute } from "./useRoute";

export default function App() {
  const route = useMemo(readRoute, []);
  // The room with chapters as screenings is the experience. The earlier book (and the 3D bookcase wall) are still there for comparison:
  // ?format=book for the book, ?library=wall for the wall.
  const screening = useMemo(() => {
    const p = new URLSearchParams(route.search);
    return p.get("format") !== "book" && p.get("library") !== "wall";
  }, [route.search]);
  useEffect(() => {
    document.title = content.meta.bookTitle.text ?? "GV90";
  }, []);
  return (
    <DebugProvider value={route.debug}>
      {screening ? <Experience route={route} /> : <Book route={route} />}
    </DebugProvider>
  );
}
