import { z } from "zod";

/** Where a string came from. Never add a fourth tier without telling the team. */
export const Source = z.enum(["brief-approved", "brief-draft", "generated"]);
export type Source = z.infer<typeof Source>;

export const Flag = z.enum(["product-claim", "fact-claim", "verify-before-use"]);
export type Flag = z.infer<typeof Flag>;

/**
 * Every visible string is a Str. Components never contain copy.
 * text === null means "not supplied": it renders as a labelled placeholder, and
 * `source` says which tier the real copy will arrive as.
 */
export const Str = z.object({
  text: z.string().nullable(),
  source: Source,
  /** Provenance, e.g. "Creative brief v1 › PL2 › Module 3". */
  ref: z.string().optional(),
  flags: z.array(Flag).optional(),
  /** Source quirks, e.g. a typo kept verbatim. */
  note: z.string().optional(),
});
export type Str = z.infer<typeof Str>;

const Media = z.object({
  status: z.enum(["placeholder", "from-brief", "supplied"]),
  src: z.string().nullable(),
  /** Developer-facing name shown on placeholder frames. */
  assetName: z.string(),
  alt: Str,
  aspect: z.enum(["4:5", "16:9"]),
  focal: z.object({ x: z.number(), y: z.number() }).optional(),
  note: z.string().optional(),
  sourceId: z.string().optional(),
});
export type Media = z.infer<typeof Media>;

const VideoRef = z.object({
  /** Filename as written in the brief. */
  name: z.string(),
  status: z.enum(["placeholder", "supplied"]),
  /** Which labelled sample clip stands in until real sources exist. */
  placeholderId: z.string(),
  sources: z.object({ mp4: z.string().nullable(), webm: z.string().nullable() }),
  poster: z.string().nullable(),
  captions: z.object({ vtt: z.string().nullable(), source: Source }),
  ref: z.string().optional(),
  sourceId: z.string().optional(),
});
export type VideoRef = z.infer<typeof VideoRef>;

const Module = z.object({
  /** Internal module name from the brief. Debug only, never rendered as copy. */
  label: Str,
  /** Creative direction. Debug only, never rendered as copy. */
  direction: Str.optional(),
  /** Reader copy, one bullet per screen, verbatim. */
  beats: z.array(Str),
});
export type Module = z.infer<typeof Module>;

const HotspotIn = z.object({
  id: z.string(),
  kind: z.enum(["info", "picker", "rsvp"]),
  label: Str,
  line: Str.optional(),
  /** Reuse a beat as the hotspot's one line, so the copy lives in one place. */
  lineFrom: z.object({ module: z.number().int(), beat: z.number().int() }).optional(),
  /** Percent of the hero frame. Layout placeholder only. */
  at: z.object({ x: z.number(), y: z.number() }),
  /** Seconds into the chapter video the play button seeks to. */
  videoAt: z.number().nullable(),
});

const ChapterIn = z.object({
  n: z.number().int(),
  id: z.string(),
  kind: z.enum(["prologue", "chapter", "epilogue"]),
  title: Str,
  /** eDM that unlocks the chapter. */
  unlockedBy: Str,
  unlock: z.object({ at: z.string().nullable(), placeholder: z.boolean() }),
  audience: z.object({ segment: z.enum(["all", "ryi-only", "tbc"]), ref: z.string() }),
  theme: z.object({
    mode: z.enum(["paper", "ink"]),
    accent: z.object({ name: z.string(), hex: z.string() }),
    placeholder: z.boolean(),
  }),
  /** Subject-line / header direction from the brief. Debug only. */
  headerDirection: Str.nullable(),
  /** null = intentionally none. A Str with null text = pending copy. */
  epigraph: Str.nullable(),
  /** One hero for most chapters; the prologue has three panels. */
  heroes: z.array(Media).min(1),
  modules: z.array(Module),
  hotspots: z.array(HotspotIn),
  video: VideoRef.nullable(),
  showCta: z.boolean(),
  /** Per-chapter override of the shared sealed-page teaser. */
  sealedTeaser: Str.optional(),
});

const Chapter = ChapterIn.transform((ch, ctx) => {
  const hotspots = ch.hotspots.map((h, i) => {
    let line = h.line;
    if (!line && h.lineFrom) {
      line = ch.modules[h.lineFrom.module]?.beats[h.lineFrom.beat];
      if (!line) {
        ctx.addIssue({
          code: "custom",
          message: `lineFrom points at module ${h.lineFrom.module}, beat ${h.lineFrom.beat}, which does not exist`,
          path: ["hotspots", i, "lineFrom"],
        });
        return z.NEVER;
      }
    }
    if (!line) {
      ctx.addIssue({ code: "custom", message: "hotspot needs `line` or `lineFrom`", path: ["hotspots", i] });
      return z.NEVER;
    }
    return { ...h, line };
  });
  return { ...ch, hotspots };
});
export type Chapter = z.output<typeof Chapter>;
export type Hotspot = Chapter["hotspots"][number];

export const Content = z
  .object({
    meta: z.object({
      bookTitle: Str,
      creativeBrief: z.object({ job: z.string(), version: z.string() }),
      ryiUrl: z.object({ url: z.string().url(), ref: z.string() }),
      sealedTeaser: Str,
      /** A short illustrated folk tale in the listening room. Atmosphere, not product content: nothing in it is a claim about the car. */
      tale: z.object({ title: Str, titleKo: Str, pages: z.array(Str).min(1) }).optional(),
      cta: z.object({ label: Str, ryiLabel: Str }),
      openFlags: z.array(z.object({ id: z.string(), note: z.string() })),
      sources: z.array(
        z.object({
          id: z.string(),
          kind: z.enum(["drive", "youtube", "miro", "web"]),
          label: z.string(),
          url: z.string().url(),
        }),
      ),
      ui: z.record(z.string(), Str),
    }),
    chapters: z.array(Chapter).min(1),
  })
  .superRefine((c, ctx) => {
    c.chapters.forEach((ch, i) => {
      if (ch.n !== i) ctx.addIssue({ code: "custom", message: `chapter n must equal its index (${i})`, path: ["chapters", i, "n"] });
      for (const [j, m] of ch.heroes.entries()) {
        if (m.sourceId && !c.meta.sources.some((s) => s.id === m.sourceId))
          ctx.addIssue({ code: "custom", message: `unknown sourceId ${m.sourceId}`, path: ["chapters", i, "heroes", j, "sourceId"] });
      }
    });
  });
export type Content = z.output<typeof Content>;

export const REQUIRED_UI_KEYS = [
  "begin", "loading", "eyebrowChapter", "eyebrowPrologue", "eyebrowEpilogue", "sealed", "opensOn", "dateTbc",
  "watch", "play", "pause", "close", "captionsOn", "captionsOff", "tapForSound", "soundOn", "soundOff",
  "prevChapter", "nextChapter", "railLabel", "videoLabel", "library", "pageOf", "prevPage", "nextPage", "wallOverview", "wallFocus", "roomPlay", "roomPause", "roomNextRecord", "roomJar", "roomCapTaleSub", "roomCapChaptersSub", "roomCapBaduk", "roomCapBadukSub", "badukPass", "badukNew", "badukRests", "badukBlack", "badukWhite", "roomZoomOut", "roomZoomIn",
] as const;
export type UiKey = (typeof REQUIRED_UI_KEYS)[number];
