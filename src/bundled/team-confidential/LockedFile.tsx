import { invoke } from "@tauri-apps/api/core";
import { useState, useSyncExternalStore } from "react";
import type { AttachmentRendererProps } from "../../features/conversation/contracts";
import { LockIcon } from "../../shared/design-system/icons/index";
import { Button } from "../../shared/design-system/ui/Button";
import {
  isUnlocked,
  lockedFileRoot,
  openFile,
  subscribeThreads,
} from "../../team/secret/thread";

/** A file encrypted for a confidential thread: decrypted only on this device,
 * then opened from a private temporary copy or saved where the member picks. */
export function LockedFile({ attachment, source }: AttachmentRendererProps) {
  // A file sent with a 🔒 opening message names its thread by salt, known
  // once that message is shown, so look it up as threads change.
  const rootId = useSyncExternalStore(
    subscribeThreads,
    () => lockedFileRoot(attachment.name) ?? "",
  );
  const unlocked = useSyncExternalStore(subscribeThreads, () =>
    isUnlocked(rootId),
  );
  const [name, setName] = useState<string>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (open: boolean) => {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch(source);
      if (!response.ok) throw new Error("파일을 받지 못했어요.");
      const file = await openFile(rootId, await response.arrayBuffer());
      if (!file) throw new Error("파일을 열지 못했어요.");
      setName(file.name);
      await invoke("team_bytes_save", file.bytes, {
        headers: {
          "x-team-name": encodeURIComponent(file.name),
          "x-team-open": open ? "1" : "0",
        },
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (message !== "Download cancelled") setStatus(message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span
      className="inline-flex flex-wrap items-center gap-2"
      data-no-translate=""
    >
      <LockIcon size={16} aria-hidden="true" />
      <span>{name ?? "대외비 파일"}</span>
      {unlocked ? (
        <>
          <Button size="sm" disabled={busy} onClick={() => void run(true)}>
            열기
          </Button>
          <Button
            size="sm"
            variant="subtle"
            disabled={busy}
            onClick={() => void run(false)}
          >
            저장
          </Button>
        </>
      ) : (
        <span className="text-muted">
          스레드 첫 메시지에서 비밀번호로 열 수 있어요
        </span>
      )}
      {status && <span role="alert">{status}</span>}
    </span>
  );
}
