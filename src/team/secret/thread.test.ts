import { expect, it, describe } from "vitest";
import {
  armDraft,
  disarmDraft,
  isArmed,
  isLockedFileName,
  isSealedThread,
  isUnlocked,
  lockDraftKey,
  lockedFileRoot,
  lockedFileThread,
  noteThreadRoot,
  openFile,
  openReply,
  openRoot,
  registerRoot,
  sealDraftFile,
  sealDraftText,
  sealedFor,
  sealedThreadRefusal,
  sealFile,
  sealOutgoing,
  startThread,
  THREAD_REPLY_TOKEN,
  THREAD_ROOT_TOKEN,
  unlockThread,
} from "./thread";

it("keeps the starter unlocked and encrypts every reply", async () => {
  const token = await startThread("견적서 내용", "correct-horse");
  expect(token).not.toContain("견적서");
  expect(token.match(THREAD_ROOT_TOKEN)).toEqual([token]);
  expect(await sealOutgoing("root-a", "plain")).toBe("plain");
  registerRoot("root-a", token);
  expect(isSealedThread("root-a")).toBe(true);
  expect(await openRoot("root-a")).toBe("견적서 내용");
  const reply = await sealOutgoing("root-a", "답글 비밀");
  expect(reply).not.toContain("비밀");
  const sealed = reply.match(THREAD_REPLY_TOKEN)?.[0] ?? "";
  expect(await openReply("root-a", sealed)).toBe("답글 비밀");
  expect(sealedThreadRefusal("root-a", true)).toMatch(/파일/);
  expect(sealedThreadRefusal("other", true)).toBeUndefined();
}, 60_000);

it("refuses to send while locked and opens only with the password", async () => {
  const token = await startThread("내용", "correct-horse");
  // The first registration takes the starter's key; root-e is how the same
  // thread looks to anyone else, who has only the password.
  registerRoot("root-b", token);
  registerRoot("root-e", token);
  expect(sealedThreadRefusal("root-e", false)).toMatch(/비밀번호/);
  await expect(sealOutgoing("root-e", "leak")).rejects.toThrow();
  expect(await unlockThread("root-e", "wrong-password")).toBeNull();
  expect(await unlockThread("root-e", "correct-horse")).toBe("내용");
  expect(sealedThreadRefusal("root-e", false)).toBeUndefined();
}, 60_000);

it("marks a thread from its loaded opening message, ignoring plain ones", async () => {
  const token = await startThread("내용", "correct-horse");
  noteThreadRoot("root-plain", "그냥 메시지");
  expect(isSealedThread("root-plain")).toBe(false);
  noteThreadRoot("root-f", `🔒 대외비 스레드 ${token}`);
  expect(isSealedThread("root-f")).toBe(true);
}, 60_000);

it("locks a file's name, type and bytes, and opens it only with the thread key", async () => {
  const token = await startThread("파일 스레드", "correct-horse");
  registerRoot("a".repeat(64), token);
  const original = new File(["견적서 PDF 내용"], "견적서.pdf", {
    type: "application/pdf",
  });
  const sealed = await sealFile("a".repeat(64), original);
  expect(sealed.name).toBe(`locked.${"a".repeat(64)}.buzzlock`);
  expect(lockedFileThread(sealed.name)).toBe("a".repeat(64));
  const raw = new Uint8Array(await sealed.arrayBuffer());
  expect(new TextDecoder().decode(raw)).not.toContain("견적서");
  const opened = await openFile("a".repeat(64), await sealed.arrayBuffer());
  expect(opened?.name).toBe("견적서.pdf");
  expect(opened?.type).toBe("application/pdf");
  expect(new TextDecoder().decode(opened?.bytes)).toBe("견적서 PDF 내용");
  registerRoot("b".repeat(64), token);
  expect(await openFile("b".repeat(64), await sealed.arrayBuffer())).toBeNull();
  expect(lockedFileThread("견적서.pdf")).toBeUndefined();
  // Only files this device sealed count; a look-alike name does not.
  expect(sealedFor(sealed)).toBe("a".repeat(64));
  expect(sealedFor(new File(["plain"], sealed.name))).toBeUndefined();
}, 60_000);

it("keeps @everyone / @all outside the ciphertext so they still notify", async () => {
  const token = await startThread("공지 스레드", "correct-horse");
  registerRoot("c".repeat(64), token);
  const reply = await sealOutgoing("c".repeat(64), "@everyone 회의 자료 확인");
  expect(reply.endsWith(" @everyone")).toBe(true);
  expect(reply).not.toContain("회의");
  expect(await sealOutgoing("c".repeat(64), "그냥 답글")).not.toContain("@");
}, 60_000);

describe("🔒 armed draft", () => {
  it("sends text and files that open with the thread's password", async () => {
    const draft = lockDraftKey("scope", "channel");
    await armDraft(draft, "secret-pass");
    expect(isArmed(draft)).toBe(true);
    const file = await sealDraftFile(
      draft,
      new File(["hello"], "plan.txt", { type: "text/plain" }),
    );
    expect(isLockedFileName(file.name)).toBe(true);
    const sent = await sealDraftText(draft, "opening");
    const token = sent.match(THREAD_ROOT_TOKEN)?.[0] ?? "";
    const rootId = "f".repeat(64);
    registerRoot(rootId, token);
    expect(isUnlocked(rootId)).toBe(true);
    expect(lockedFileRoot(file.name)).toBe(rootId);
    expect(await openRoot(rootId)).toBe("opening");
    const opened = await openFile(rootId, await file.arrayBuffer());
    expect(opened?.name).toBe("plan.txt");
    expect(new TextDecoder().decode(opened?.bytes)).toBe("hello");
    disarmDraft(draft);
    expect(isArmed(draft)).toBe(false);
  });
});
