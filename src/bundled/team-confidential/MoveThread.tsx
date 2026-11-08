import { useState } from "react";
import type { ChannelMessage } from "../../features/relay/contracts";
import type { RelaySession } from "../../features/relay/session";
import { Button } from "../../shared/design-system/ui/Button";
import { Dialog } from "../../shared/design-system/ui/Dialog";
import { Input } from "../../shared/design-system/ui/Input";
import { MIN_PASSWORD } from "../../team/secret/secret";
import { startThread } from "../../team/secret/thread";
import { threadTranscript } from "../../team/secret/transcript";

const MAX_PAGES = 20;

/** Every loaded message of a thread, oldest first. */
async function readThread(session: RelaySession, message: ChannelMessage) {
  const view = session.thread(message.channelId, message.id);
  try {
    await view.refresh();
    for (let page = 0; view.snapshot().canLoadMore && page < MAX_PAGES; page++)
      await view.loadMore();
    const { status, root, replies, error, limited, canLoadMore } =
      view.snapshot();
    if (status === "error") throw new Error(error ?? "스레드를 읽지 못했어요.");
    // A partial copy would silently drop replies.
    if (limited || canLoadMore)
      throw new Error(
        "스레드가 너무 길어서 전부 읽지 못했어요. 옮기지 않았어요.",
      );
    return [root ?? message, ...replies];
  } finally {
    view.dispose();
  }
}

/** Copies a thread, encrypted, into a new confidential thread. The original
 * stays: what was sent is already on the server, so its writers delete it. */
export function MoveThread({
  message,
  session,
  close,
}: {
  message: ChannelMessage;
  session: RelaySession;
  close(): void;
}) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const move = async () => {
    setBusy(true);
    setStatus("");
    try {
      const messages = await readThread(session, message);
      const names = session.profiles.snapshot();
      const text = threadTranscript(
        messages,
        (key) => names.get(key)?.name ?? `${key.slice(0, 8)}…`,
      );
      const token = await startThread(text, password);
      await session.messages.send(
        message.channelId,
        `🔒 대외비 스레드 (SHIBALPOINT 앱에서 비밀번호로 열람) ${token}`,
      );
      setDone(true);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "옮기지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
      preventClose={busy}
      size="compact"
      title="대외비 스레드로 옮기기"
      description={
        done
          ? "옮겼어요. 원래 글은 서버에 그대로 남아 있으니, 쓴 분들이 직접 지워 주세요."
          : "이 스레드의 글을 잠가서 새 대외비 스레드로 옮겨요. 첨부 파일은 옮기지 않아요."
      }
      actions={
        done ? (
          <Button onClick={close}>닫기</Button>
        ) : (
          <Button
            disabled={busy || password.length < MIN_PASSWORD}
            onClick={() => void move()}
          >
            {busy ? "옮기는 중…" : "잠가서 옮기기"}
          </Button>
        )
      }
    >
      {!done && (
        <div className="flex flex-col gap-2" data-no-translate="">
          <Input
            type="password"
            autoComplete="new-password"
            aria-label="비밀번호"
            placeholder={`비밀번호 (${MIN_PASSWORD}자 이상)`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {status && <p role="alert">{status}</p>}
        </div>
      )}
    </Dialog>
  );
}
