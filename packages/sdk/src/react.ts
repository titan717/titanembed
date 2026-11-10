import { createElement, forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";
import { createPlayer, type EventMap, type PlayerOptions, type TitanPlayer } from "./index";

export interface TitanEmbedProps extends PlayerOptions {
  className?: string;
  style?: CSSProperties;
  onReady?: (d: EventMap["ready"]) => void;
  onTimeUpdate?: (d: EventMap["timeupdate"]) => void;
  onEnded?: () => void;
  onError?: (d: EventMap["error"]) => void;
  onExit?: (d: EventMap["exit"]) => void;
  onEvent?: (e: { event: string; data: unknown }) => void;
}

/**
 * React wrapper. The iframe is created once per `embedUrl`/`player`; `media` changes are sent with `load()` and
 * `theme` changes with `setTheme()`, so playback is not restarted by unrelated re-renders.
 */
export const TitanEmbed = forwardRef<TitanPlayer | null, TitanEmbedProps>(function TitanEmbed(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<TitanPlayer | null>(null);
  const cbs = useRef(props);
  cbs.current = props;
  const first = useRef(true);
  useImperativeHandle(ref, () => player.current as TitanPlayer, []);

  useEffect(() => {
    if (!host.current) return;
    const p = createPlayer(host.current, { ...cbs.current });
    player.current = p;
    first.current = true;
    const off = p.on("*", (e) => {
      const { event, data } = e as unknown as { event: string; data: unknown };
      const c = cbs.current;
      c.onEvent?.({ event, data });
      if (event === "ready") c.onReady?.(data as EventMap["ready"]);
      else if (event === "timeupdate") c.onTimeUpdate?.(data as EventMap["timeupdate"]);
      else if (event === "ended") c.onEnded?.();
      else if (event === "error") c.onError?.(data as EventMap["error"]);
      else if (event === "exit") c.onExit?.(data as EventMap["exit"]);
    });
    return () => {
      off();
      p.destroy();
      player.current = null;
    };
  }, [props.embedUrl, props.player]);

  const mediaKey = props.media ? JSON.stringify(props.media) : "";
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (props.media) void player.current?.load(props.media, { autoplay: props.autoplay }).catch(() => undefined);
  }, [mediaKey]);

  const themeKey = props.theme ? JSON.stringify(props.theme) : "";
  useEffect(() => {
    if (props.theme) void player.current?.setTheme(props.theme).catch(() => undefined);
  }, [themeKey]);

  return createElement("div", { ref: host, className: props.className, style: { position: "relative", aspectRatio: "16 / 9", background: "#000", ...props.style } });
});
