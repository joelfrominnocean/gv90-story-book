import type { DrawPage, HeroDraw } from "../book3d/textures";
import { content, fill, ui, unlockState, type Chapter } from "../content";
import { eyebrowFor, type PageSpec } from "./pages";

const heroOf = (ch: Chapter, i: number): HeroDraw => {
  const h = ch.heroes[i] ?? ch.heroes[0]!;
  return { src: h.src, aspect: h.aspect, assetName: h.assetName };
};

/** What a page looks like when printed on a 3D leaf: the same words and structure as its live HTML page. */
export function drawSpecFor(ch: Chapter, spec: PageSpec, o: { preview: boolean; ryi: boolean }): DrawPage {
  const mode = ch.theme.mode;
  const accent = ch.theme.accent.hex;
  const eyebrow = fill(eyebrowFor(ch).text ?? "", { n: ch.n });
  const title = ch.title.text ?? "";
  const watch = ch.video ? (ui("watch").text ?? null) : null;

  switch (spec.kind) {
    case "opener":
      return {
        type: "opener",
        mode,
        accent,
        eyebrow,
        title,
        epigraph: ch.epigraph?.text ?? null,
        epigraphPending: ch.epigraph !== null && ch.epigraph.text === null,
        hero: heroOf(ch, 0),
        watch,
      };
    case "panel":
      return { type: "panel", mode, accent, hero: heroOf(ch, spec.hero), header: spec.hero === 0 ? { eyebrow, title } : null, watch: spec.hero === 0 ? watch : null };
    case "beats": {
      const beats = spec.beats.map((i) => ch.modules[spec.module]!.beats[i]!);
      return { type: "beats", mode, texts: beats.map((b) => b.text), pending: beats.map((b) => b.ref ?? "") };
    }
    case "close":
      return { type: "close", mode, accent, cta: (o.ryi ? content.meta.cta.ryiLabel : content.meta.cta.label).text ?? "" };
    case "sealed": {
      const state = unlockState(ch, o.preview);
      const sealed = ui("sealed").text ?? "";
      return {
        type: "sealed",
        mode,
        accent,
        eyebrow,
        title,
        teaser: (ch.sealedTeaser ?? content.meta.sealedTeaser).text ?? "",
        opens: `${sealed} · ${state.dateLabel ? fill(ui("opensOn").text ?? "", { date: state.dateLabel }) : (ui("dateTbc").text ?? "")}`,
      };
    }
  }
}
