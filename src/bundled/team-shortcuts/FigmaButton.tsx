import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { Button } from "../../shared/design-system/ui/Button";
import {
  PopoverPopup,
  PopoverRoot,
  PopoverTrigger,
} from "../../shared/design-system/ui/Popover";

/** Where Figma links open on this device, picked the first time. */
type Way = "browser" | "app";
const KEY = "buzz-team-figma-open.v1";
const FIGMA_HOME = "https://www.figma.com/files/recents-and-sharing";

function savedWay(): Way | undefined {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "browser" || value === "app" ? value : undefined;
  } catch {
    return undefined;
  }
}
function saveWay(way: Way) {
  try {
    window.localStorage.setItem(KEY, way);
  } catch {
    // Without storage, the choice is asked again next time.
  }
}

/** Opens in a new browser window the way the header's other links do. */
function openInBrowser(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.click();
}

async function open(url: string, way: Way) {
  if (way === "app") {
    try {
      await invoke("team_open_figma", { url });
      return;
    } catch {
      // Figma missing or refused: the browser still opens it.
    }
  }
  openInBrowser(url);
}

function FigmaLogo() {
  return (
    <svg width="12" height="18" viewBox="0 0 38 57" aria-hidden="true">
      <path
        fill="#1abcfe"
        d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"
      />
      <path
        fill="#0acf83"
        d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"
      />
      <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path
        fill="#f24e1e"
        d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z"
      />
      <path
        fill="#a259ff"
        d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z"
      />
    </svg>
  );
}

/**
 * The channel header's Figma button: the channel's saved Figma link, else
 * Figma's file list. The first click asks how to open it; Option-click asks
 * again.
 */
export function FigmaButton({ link }: { link: string | undefined }) {
  const [asking, setAsking] = useState(false);
  const url = link ?? FIGMA_HOME;
  const pick = (way: Way) => {
    saveWay(way);
    setAsking(false);
    void open(url, way);
  };
  return (
    <PopoverRoot
      open={asking}
      onOpenChange={(next, details) => {
        // A remembered choice opens at once; Option-click asks again.
        const way = savedWay();
        const alt = details.event instanceof MouseEvent && details.event.altKey;
        if (next && way && !alt) {
          void open(url, way);
          return;
        }
        setAsking(next);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-line p-0 hover:bg-hover"
            aria-label={link ? "이 채널의 피그마 열기" : "피그마 열기"}
            title={`${link ? "이 채널의 피그마 열기" : "피그마 열기 (🔗에 피그마 주소를 저장하면 그 파일이 열려요)"} · ⌥클릭: 여는 방식 다시 고르기`}
          >
            <FigmaLogo />
          </button>
        }
      />
      <PopoverPopup side="bottom" aria-label="피그마 여는 방식">
        <div className="flex flex-col gap-2 text-sm" data-no-translate="">
          <p>피그마를 어떻게 열까요? 고른 방식은 기억해 둘게요.</p>
          <Button onClick={() => pick("browser")}>브라우저 새 창으로</Button>
          <Button variant="subtle" onClick={() => pick("app")}>
            피그마 앱으로
          </Button>
          <p className="text-xs text-muted">
            ⌥(Option)를 누른 채 클릭하면 다시 고를 수 있어요.
          </p>
        </div>
      </PopoverPopup>
    </PopoverRoot>
  );
}
