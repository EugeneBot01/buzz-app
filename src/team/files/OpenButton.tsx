import { useState } from "react";
import { isNativeMediaSource } from "../../features/messages/attachment-source";
import { artcraftAppFor, canOpenFile, openNativeMedia } from "./open";

/** Whether an attachment gets an open control at all. */
export function canOpenAttachment(
  source: string | undefined,
  name: string | undefined,
): boolean {
  return Boolean(
    source && name && canOpenFile(name) && isNativeMediaSource(source),
  );
}

/** "열기" beside a downloadable attachment; nothing for other file types.
 *  The "icon" variant is an open-book icon placed inside the file card. */
export function OpenFileButton({
  source,
  name,
  className,
  variant = "text",
}: {
  source: string | undefined;
  name: string | undefined;
  className?: string | undefined;
  variant?: "text" | "icon";
}) {
  const [state, setState] = useState<"idle" | "opening" | "failed">("idle");
  if (!source || !name || !canOpenAttachment(source, name)) return null;
  const app = artcraftAppFor(name);
  const label =
    state === "opening"
      ? "여는 중…"
      : state === "failed"
        ? "열기 실패 · 다시 누르기"
        : app
          ? `${app}(으)로 열기`
          : "기본 앱으로 열기";
  const open = () => {
    setState("opening");
    openNativeMedia(source, name).then(
      () => setState("idle"),
      () => setState("failed"),
    );
  };
  if (variant === "icon")
    return (
      <button
        type="button"
        data-no-translate=""
        data-state={state}
        className={className}
        aria-label={`${name} ${app ? `${app}(으)로 ` : ""}열기`}
        title={label}
        disabled={state === "opening"}
        onClick={open}
      >
        <svg
          viewBox="0 0 64 64"
          width="20"
          height="20"
          aria-hidden="true"
          style={{ width: 20, height: 20, flexShrink: 0 }}
        >
          {/* The team's own open-book mark. */}
          <path
            d="M32 19C25 13 17 12 8 15V46C17 43 25 44 32 50C39 44 47 43 56 46V15C47 12 39 13 32 19V50"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
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
      onClick={open}
    >
      {state === "opening"
        ? "여는 중…"
        : state === "failed"
          ? "열기 실패"
          : "열기"}
    </button>
  );
}
