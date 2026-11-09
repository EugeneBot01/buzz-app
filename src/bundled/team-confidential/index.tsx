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
  lockedFileThread,
  openReply,
  openRoot,
  registerRoot,
  startThread,
  subscribeThreads,
  THREAD_REPLY_TOKEN,
  THREAD_ROOT_TOKEN,
  unlockThread,
} from "../../team/secret/thread";
import { LockedFile } from "./LockedFile";
import { MoveThread } from "./MoveThread";

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
      await session.messages.send(
        channelId,
        `🔒 대외비 스레드 (SHIBALPOINT 앱에서 비밀번호로 열람) ${token}`,
      );
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
  asking: askAtOnce = false,
}: {
  open: (password: string) => Promise<boolean>;
  /** Show the password field at once instead of after a first click. */
  asking?: boolean;
}) {
  const [asking, setAsking] = useState(askAtOnce);
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

/** The opening message's hint and token, drawn together as one card. */
const THREAD_CARD = new RegExp(
  `(?:🔒 대외비 스레드 \\([^()\\n]{1,60}\\) )?${THREAD_ROOT_TOKEN.source}`,
  "g",
);

function ThreadRoot({
  text,
  content: { message },
  canOpen,
  open,
}: {
  text: string;
  content: InlineContent;
  canOpen(target: string): boolean;
  open(target: string): boolean;
}) {
  const token = text.match(new RegExp(THREAD_ROOT_TOKEN.source))?.[0] ?? text;
  useEffect(() => registerRoot(message.id, token), [message.id, token]);
  const unlocked = useUnlocked(message.id);
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    if (unlocked) void openRoot(message.id).then(setOpened);
  }, [unlocked, message.id]);
  const thread = `buzz://message/?channel=${message.channelId}&id=${message.id}&thread=${message.id}`;
  const shown = unlocked && opened !== null;
  return (
    <span
      className="my-1 flex max-w-md flex-col gap-2 rounded-lg border border-line p-3"
      data-no-translate=""
    >
      <span className="flex items-center gap-2 font-medium">
        <LockIcon size={16} aria-hidden="true" />
        대외비 스레드
        <span className="text-muted text-xs font-normal">
          {shown ? "열림 · 이 기기에서만 보여요" : "잠김"}
        </span>
      </span>
      {shown ? (
        <>
          <span className="whitespace-pre-wrap rounded-md bg-soft p-2">
            {opened}
          </span>
          {canOpen(thread) && (
            <span>
              <Button type="button" size="sm" onClick={() => open(thread)}>
                스레드 열기
              </Button>
            </span>
          )}
        </>
      ) : (
        <PasswordPrompt
          asking
          open={async (password) =>
            (await unlockThread(message.id, password)) !== null
          }
        />
      )}
    </span>
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
    matches: ranges(THREAD_CARD),
    component: ThreadRoot,
  });
  ctx.conversation.registerInline({
    id: "secret-reply",
    title: "Confidential reply",
    matches: ranges(THREAD_REPLY_TOKEN),
    component: ThreadReply,
  });
  ctx.conversation.registerAttachment({
    id: "locked-file",
    title: "Confidential file",
    matches: (attachment) => !!lockedFileThread(attachment.name),
    component: LockedFile,
  });
  ctx.conversation.registerMessageAction({
    id: "move-to-confidential",
    title: "대외비 스레드로 옮기기",
    icon: () => <LockIcon size={16} aria-hidden="true" />,
    // A thread's opening message that is not confidential already.
    matches: (message) =>
      !message.threadRootId &&
      !!message.content.trim() &&
      ![THREAD_ROOT_TOKEN, THREAD_REPLY_TOKEN, SECRET_TOKEN].some((token) =>
        new RegExp(token.source).test(message.content),
      ),
    component: MoveThread,
  });
};
