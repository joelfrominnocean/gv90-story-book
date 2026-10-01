import { useEffect, useRef, useState } from "react";
import { useDebug } from "../app/debug";
import { ui, type Chapter } from "../content";
import { asset } from "../content/asset";
import { Badge, Copy } from "./Copy";

interface Props {
  chapter: Chapter;
  /** Seconds to start from. */
  at: number;
  onClose: () => void;
}

/**
 * Full-screen vertical player. Muted autoplay, tap for sound, captions on by default.
 * It sits on top of the chapter page rather than replacing it, so closing returns to the same scroll position.
 * Captions are drawn from the VTT cues by us (not natively) so they are styled and work inline on iOS.
 */
export function VideoPlayer({ chapter, at, onClose }: Props) {
  const debug = useDebug();
  const video = chapter.video!;
  const el = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [cue, setCue] = useState("");
  const [progress, setProgress] = useState(0);

  const base = asset(`/placeholders/${video.placeholderId}`);
  const mp4 = video.sources.mp4 ?? `${base}.mp4`;
  const webm = video.sources.webm ?? `${base}.webm`;
  const vtt = video.captions.vtt ?? asset("/placeholders/sample.vtt");
  const isPlaceholder = video.status === "placeholder";

  useEffect(() => {
    const v = el.current;
    if (!v) return;
    let track: TextTrack | undefined;
    const onCue = () => {
      const active = track ? Array.from(track.activeCues ?? []) : [];
      setCue(active.map((c) => (c as VTTCue).text).join("\n"));
    };
    const attach = () => {
      const t = v.textTracks[0];
      if (!t || t === track) return;
      track?.removeEventListener("cuechange", onCue);
      track = t;
      track.mode = "hidden"; // load cues, but draw them ourselves
      track.addEventListener("cuechange", onCue);
    };
    const onMeta = () => {
      attach();
      if (at > 0) v.currentTime = at;
      void v.play().catch(() => setPlaying(false));
    };
    const onTime = () => setProgress(v.duration ? v.currentTime / v.duration : 0);
    attach();
    v.textTracks.addEventListener("addtrack", attach);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", () => setPlaying(true));
    v.addEventListener("pause", () => setPlaying(false));
    return () => {
      track?.removeEventListener("cuechange", onCue);
      v.textTracks.removeEventListener("addtrack", attach);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleSound = () => {
    const v = el.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (v.paused) void v.play();
  };

  const onTap = () => {
    const v = el.current;
    if (!v) return;
    if (v.muted) return toggleSound();
    if (v.paused) void v.play();
    else v.pause();
  };

  return (
    <section className="video" role="dialog" aria-modal="true" aria-label={ui("videoLabel").text ?? undefined}>
      <video
        ref={el}
        className="video__el"
        autoPlay
        muted
        playsInline
        loop={isPlaceholder}
        preload="auto"
        poster={video.poster ?? undefined}
        onClick={onTap}
      >
        <source src={webm} type="video/webm" />
        <source src={mp4} type="video/mp4" />
        <track kind="captions" src={vtt} srcLang="en" label="English" />
      </video>

      <div className="video__top">
        <button type="button" className="icon-btn icon-btn--light" onClick={onClose} aria-label={ui("close").text ?? undefined} autoFocus>
          <span className="icon-x" aria-hidden="true" />
        </button>
        {debug && (
          <p className="video__dbg">
            {video.status} · {video.name}
            <br />
            captions: {video.captions.source}
          </p>
        )}
      </div>

      {captionsOn && cue && (
        <p className="video__caption" aria-live="polite">
          {cue}
        </p>
      )}

      {muted && (
        <button type="button" className="video__hint" onClick={toggleSound}>
          <Copy s={ui("tapForSound")} badge={false} />
        </button>
      )}

      <div className="video__bar">
        <div className="video__progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
        <div className="video__controls">
          <button
            type="button"
            className="chip"
            aria-pressed={captionsOn}
            onClick={() => setCaptionsOn((c) => !c)}
          >
            {captionsOn ? <Copy s={ui("captionsOn")} badge={false} /> : <Copy s={ui("captionsOff")} badge={false} />}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => {
              const v = el.current;
              if (!v) return;
              if (v.paused) void v.play();
              else v.pause();
            }}
          >
            {playing ? <Copy s={ui("pause")} badge={false} /> : <Copy s={ui("play")} badge={false} />}
          </button>
          <button type="button" className="chip" aria-pressed={!muted} onClick={toggleSound}>
            {muted ? <Copy s={ui("soundOff")} badge={false} /> : <Copy s={ui("soundOn")} badge={false} />}
          </button>
          {debug && <Badge s={ui("tapForSound")} />}
        </div>
      </div>
    </section>
  );
}
