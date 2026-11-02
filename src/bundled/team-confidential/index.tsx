import { useState } from "react";
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
  encryptSecret,
  MIN_PASSWORD,
  SECRET_TOKEN,
} from "../../team/secret/secret";

export const inject = ["conversation"];

function SecretTool({ disabled, insertText }: ComposerToolProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const reset = () => {
    setText("");
    setPassword("");
    setStatus("");
  };
  const seal = async () => {
    setBusy(true);
    try {
      const token = await encryptSecret(text, password);
      if (!insertText(`🔒 대외비 (Buzz Team에서 비밀번호로 열람) ${token} `)) {
        setStatus("메시지 입력창에 넣지 못했어요.");
        return;
      }
      reset();
      setOpen(false);
    } catch (reason) {
      setStatus(
        reason instanceof Error ? reason.message : "암호화하지 못했어요.",
      );
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
            aria-label="대외비 메시지"
            title="대외비 메시지"
            icon={<LockIcon size={20} aria-hidden="true" />}
          />
        }
      />
      <PopoverPopup side="top" aria-label="대외비 메시지" size="wide">
        <div className="flex flex-col gap-2" data-no-translate="">
          <Textarea
            aria-label="대외비 내용"
            placeholder="비밀번호를 아는 사람만 볼 내용"
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
            비밀번호는 Buzz 밖에서 전달하세요. 잃어버리면 아무도 열 수 없고,
            첨부 파일은 암호화되지 않아요. 암호화한 뒤 메시지를 보내야 전송돼요.
          </p>
          {status && <p role="alert">{status}</p>}
          <Button
            type="button"
            disabled={busy || !text.trim() || password.length < MIN_PASSWORD}
            onClick={() => void seal()}
          >
            {busy ? "암호화 중…" : "암호화해서 넣기"}
          </Button>
        </div>
      </PopoverPopup>
    </PopoverRoot>
  );
}

function SecretMessage({ text: token }: { text: string }) {
  const [opened, setOpened] = useState<string>();
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const tryOpen = async () => {
    setBusy(true);
    setStatus("");
    const found = password ? await decryptSecret(token, password) : null;
    setBusy(false);
    if (found !== null) {
      setPassword("");
      setOpened(found);
      return;
    }
    setAsking(true);
    if (password) setStatus("비밀번호가 맞지 않아요.");
  };
  if (opened !== undefined)
    return (
      <span className="whitespace-pre-wrap" data-no-translate="">
        {opened}
      </span>
    );
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

export const apply: PluginModule["apply"] = (ctx) => {
  ctx.conversation.registerTool({
    id: "secret",
    title: "Confidential message",
    component: SecretTool,
  });
  ctx.conversation.registerInline({
    id: "secret",
    title: "Confidential message",
    matches: ({ text }: InlineContent) =>
      [...text.matchAll(SECRET_TOKEN)].map((match) => ({
        start: match.index,
        end: match.index + match[0].length,
      })),
    component: SecretMessage,
  });
};
