import { useEffect, useRef, useState } from "react";
import { canOpenFile } from "../../team/files/open";
import { savedSources, showSaved } from "../../team/files/saved";
import { downloadNativeMedia } from "./native-download";

/** Team build: opens the copy saved earlier (or shows it in Finder when its
 * type does not open directly). False when there is none, or outside the main
 * window, where the host keeps no saved copies. */
async function openSavedCopy(source: string, name: string) {
  try {
    const [saved] = await savedSources([source]);
    if (!saved) return false;
    await showSaved(source, canOpenFile(name));
    return true;
  } catch {
    return false;
  }
}

export type DownloadState = "idle" | "pending" | "saved" | "failed";

/** The host's answer when the save dialog is closed without choosing a place. */
export const isDownloadCancel = (reason: unknown) =>
  reason === "Download cancelled";

/** The caller keys its action by attachment/source so each mount owns one lifetime. */
export function useNativeDownload(
  source: string,
  name: string,
  savedDuration = 4000,
  // Team build: file attachments open the copy saved earlier instead.
  reuseSaved = false,
) {
  const [state, setState] = useState<DownloadState>("idle");
  const pending = useRef(false);
  useEffect(() => {
    if (state !== "saved") return;
    const timer = setTimeout(() => setState("idle"), savedDuration);
    return () => clearTimeout(timer);
  }, [state, savedDuration]);
  const download = async () => {
    if (pending.current) return;
    pending.current = true;
    setState("pending");
    try {
      // Team build: a file this device already saved opens instead of
      // downloading again, as in KakaoTalk.
      if (reuseSaved && (await openSavedCopy(source, name))) {
        setState("saved");
        return;
      }
      await downloadNativeMedia(source, name);
      setState("saved");
    } catch (reason) {
      setState(isDownloadCancel(reason) ? "idle" : "failed");
    } finally {
      pending.current = false;
    }
  };
  return { state, download };
}
