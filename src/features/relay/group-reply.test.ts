import { expect, it, vi } from "vitest";
import { createMessages } from "./messages";
import { createOutbox } from "./outbox";
import { keypair, message, signed } from "./testing";

it("Team: @everyone in a thread reply tags the channel's people", async () => {
  const author = keypair();
  const member = keypair();
  const root = message(member, "channel", "A thread", 1);
  const writer = {
    kinds: [9],
    sign: vi.fn(async (event) => signed(author, event)),
    publish: vi.fn(async () => {}),
  };
  const { outbox } = createOutbox(author.pubkey, writer, {
    load: () => [],
    save: () => {},
  });
  const groupRecipients = vi.fn(
    (_channel: string, content: string, mentions: readonly string[]) =>
      content.includes("@everyone") ? [...mentions, member.pubkey] : mentions,
  );
  const messages = createMessages(
    outbox,
    author.pubkey,
    () => undefined,
    () => [],
    () => {},
    () => true,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    groupRecipients,
  );
  messages.reply("channel", root.id, "@everyone 확인해 주세요");
  await outbox.ready();
  const sent = outbox.snapshot()[0]?.event;
  expect(sent?.tags).toContainEqual(["p", member.pubkey]);
});
