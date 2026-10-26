import { useState } from "react";
import { isNativeMediaSource } from "../../features/messages/attachment-source";
import { artcraftAppFor, canOpenFile, openNativeMedia } from "./open";

/** "열기" beside a downloadable attachment; nothing for other file types. */
export function OpenFileButton({
  source,
  name,
  className,
}: {
  source: string | undefined;
  name: string | undefined;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "opening" | "failed">("idle");
  if (!source || !name || !canOpenFile(name) || !isNativeMediaSource(source))
    return null;
  const app = artcraftAppFor(name);
  return (
    <button
      type="button"
      data-no-translate=""
      className={
        className ??
        "ml-2 rounded-md px-2 py-1 text-xs text-muted hover:bg-hover hover:text-ink"
      }
      aria-label={`${name} ${app ? `${app}(으)로 ` : ""}열기`}
      title={app ? `${app}(으)로 열기` : "기본 앱으로 열기"}
      disabled={state === "opening"}
      onClick={() => {
        setState("opening");
        openNativeMedia(source, name).then(
          () => setState("idle"),
          () => setState("failed"),
        );
      }}
    >
      {state === "opening"
        ? "여는 중…"
        : state === "failed"
          ? "열기 실패"
          : "열기"}
    </button>
  );
}
