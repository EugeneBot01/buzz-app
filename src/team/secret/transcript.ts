/** The text a moved thread carries into its confidential copy. */
export function threadTranscript(
  messages: readonly Readonly<{
    authorId: string;
    createdAt: number;
    content: string;
    attachments: readonly unknown[];
  }>[],
  name: (pubkey: string) => string,
) {
  return messages
    .map((message) => {
      const when = new Date(message.createdAt * 1000).toLocaleString("ko-KR");
      const files = message.attachments.length
        ? `\n(첨부 파일 ${message.attachments.length}개는 옮기지 않았어요)`
        : "";
      return `[${name(message.authorId)} · ${when}]\n${message.content}${files}`;
    })
    .join("\n\n");
}
