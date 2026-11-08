import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PluginModule } from "../../plugins/api";
import type {
  ComposerToolProps,
  InlineContent,
} from "../../features/conversation/contracts";
import { LockIcon } from "../../shared/design-system/icons/index";
import { Button } from "../../shared/design-system/ui/Button";
import { IconButton } from "../../shared/design-system/ui/IconButton";
import { Input } from "../../shared/design-system/ui/Input";
import { Textarea } from "../../shared/design-system/ui/Textarea";
import {
  PopoverPopup,
  PopoverRoot,
  PopoverTrigger,
} from "../../shared/design-system/ui/Popover";
import {
  decryptSecret,
  MIN_PASSWORD,
  SECRET_TOKEN,
} from "../../team/secret/secret";
import {
  isUnlocked,
  openReply,
  openRoot,
  registerRoot,
  startThread,
  subscribeThreads,
  THREAD_REPLY_TOKEN,
  THREAD_ROOT_TOKEN,
  unlockThread,
} from "../../team/secret/thread";

export const inject = ["conversation"];

const useUnlocked = (rootId: string | undefined) =>
  useSyncExternalStore(subscribeThreads, () => !!rootId && isUnlocked(rootId));

/** Starts a confidential thread; its opening message is sent from here, so
 * nothing typed in the ordinary composer goes out with it. */
function SecretTool({
  disabled,
  session,
  channelId,
  threadRootId,
}: ComposerToolProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  // Focus moves into the popup, so the composer taking focus back on the
  // first click does not close it straight away.
  const field = useRef<HTMLTextAreaElement>(null);
  // Replies in a confidential thread are encrypted by the composer itself.
  if (threadRootId) return null;
  const reset = () => {
    setText("");
    setPassword("");
    setStatus("");
  };
  const start = async () => {
    setBusy(true);
    try {
      const token = await startThread(text, password);
      await session.messages.send(channelId, `🔒 대외비 스레드 ${token}`);
      reset();
      setOpen(false);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "보내지 못했어요.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <PopoverRoot
      open={open && !disabled}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger
        render={
          <IconButton
            disabled={disabled}
            size="toolbar"
            type="button"
            aria-label="대외비 스레드 시작"
            title="대외비 스레드 시작"
            icon={<LockIcon size={20} aria-hidden="true" />}
          />
        }
      />
      <PopoverPopup
        side="top"
        aria-label="대외비 스레드 시작"
        size="wide"
        initialFocus={field}
      >
        <div className="flex flex-col gap-2" data-no-translate="">
          <Textarea
            ref={field}
            aria-label="첫 메시지"
            placeholder="첫 메시지 (비밀번호를 아는 사람만 볼 수 있어요)"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Input
            type="password"
            autoComplete="new-password"
            aria-label="비밀번호"
            placeholder={`비밀번호 (${MIN_PASSWORD}자 이상)`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-xs text-muted">
            이 스레드의 답글은 모두 자동으로 잠겨요. 비밀번호는 Buzz 밖에서
            전달하세요. 잃어버리면 아무도 열 수 없어요. 파일은 아직 올릴 수
            없어요.
          </p>
          {status && <p role="alert">{status}</p>}
          <Button
            type="button"
            disabled={busy || !text.trim() || password.length < MIN_PASSWORD}
            onClick={() => void start()}
          >
            {busy ? "잠그는 중…" : "잠가서 보내기"}
          </Button>
        </div>
      </PopoverPopup>
    </PopoverRoot>
  );
}

function PasswordPrompt({
  open,
}: {
  open: (password: string) => Promise<boolean>;
}) {
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const tryOpen = async () => {
    if (!password) {
      setAsking(true);
      return;
    }
    setBusy(true);
    setStatus("");
    const opened = await open(password);
    setBusy(false);
    if (opened) setPassword("");
    else setStatus("비밀번호가 맞지 않아요.");
  };
  return (
    <span
      className="inline-flex flex-wrap items-center gap-2"
      data-no-translate=""
    >
      {asking && (
        <Input
          type="password"
          autoComplete="off"
          aria-label="비밀번호"
          placeholder="비밀번호"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void tryOpen();
          }}
        />
      )}
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={() => void tryOpen()}
      >
        {busy ? "여는 중…" : "열기"}
      </Button>
      {status && <span role="alert">{status}</span>}
    </span>
  );
}

const Opened = ({ text }: { text: string }) => (
  <span className="whitespace-pre-wrap" data-no-translate="">
    {text}
  </span>
);

/** The older single-message form, still readable. */
function SecretMessage({ text: token }: { text: string }) {
  const [opened, setOpened] = useState<string>();
  if (opened !== undefined) return <Opened text={opened} />;
  return (
    <PasswordPrompt
      open={async (password) => {
        const found = await decryptSecret(token, password);
        if (found !== null) setOpened(found);
        return found !== null;
      }}
    />
  );
}

function ThreadRoot({
  text: token,
  content: { message },
}: {
  text: string;
  content: InlineContent;
}) {
  useEffect(() => registerRoot(message.id, token), [message.id, token]);
  const unlocked = useUnlocked(message.id);
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    if (unlocked) void openRoot(message.id).then(setOpened);
  }, [unlocked, message.id]);
  if (unlocked && opened !== null) return <Opened text={opened} />;
  return (
    <PasswordPrompt
      open={async (password) =>
        (await unlockThread(message.id, password)) !== null
      }
    />
  );
}

function ThreadReply({
  text: token,
  content: { message },
}: {
  text: string;
  content: InlineContent;
}) {
  const unlocked = useUnlocked(message.threadRootId);
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    if (unlocked && message.threadRootId)
      void openReply(message.threadRootId, token).then(setOpened);
  }, [unlocked, message.threadRootId, token]);
  if (opened !== null) return <Opened text={opened} />;
  return (
    <span className="text-muted" data-no-translate="">
      잠긴 메시지 · 스레드 첫 메시지에서 비밀번호로 열 수 있어요
    </span>
  );
}

const ranges =
  (pattern: RegExp) =>
  ({ text }: InlineContent) =>
    [...text.matchAll(pattern)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }));

export const apply: PluginModule["apply"] = (ctx) => {
  ctx.conversation.registerTool({
    id: "secret",
    title: "Confidential thread",
    component: SecretTool,
  });
  ctx.conversation.registerInline({
    id: "secret",
    title: "Confidential message",
    matches: ranges(SECRET_TOKEN),
    component: SecretMessage,
  });
  ctx.conversation.registerInline({
    id: "secret-thread",
    title: "Confidential thread",
    matches: ranges(THREAD_ROOT_TOKEN),
    component: ThreadRoot,
  });
  ctx.conversation.registerInline({
    id: "secret-reply",
    title: "Confidential reply",
    matches: ranges(THREAD_REPLY_TOKEN),
    component: ThreadReply,
  });
};
