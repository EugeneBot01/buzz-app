import { expect, it } from "vitest";
import { threadTranscript } from "./transcript";

it("keeps each writer, message and a note about files left behind", () => {
  const text = threadTranscript(
    [
      {
        authorId: "a",
        createdAt: 0,
        content: "견적서 보내요",
        attachments: [1],
      },
      { authorId: "b", createdAt: 60, content: "확인했어요", attachments: [] },
    ],
    (key) => (key === "a" ? "성태엄마" : "EGB01"),
  );
  expect(text).toContain("[성태엄마 · ");
  expect(text).toContain("견적서 보내요\n(첨부 파일 1개는 옮기지 않았어요)");
  expect(text).toContain("[EGB01 · ");
  expect(text.indexOf("견적서")).toBeLessThan(text.indexOf("확인했어요"));
});
