import { expect, it } from "vitest";
import {
  isSealedThread,
  noteThreadRoot,
  openReply,
  openRoot,
  registerRoot,
  sealedThreadRefusal,
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
