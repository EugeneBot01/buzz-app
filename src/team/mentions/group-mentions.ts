/**
 * `@everyone` (every person in the channel) and `@all` (people and agents),
 * Buzz Team.
 *
 * The sender expands them into ordinary `p` recipients before sending, so
 * every receiver gets a normal mention alert and agents treat it as a mention,
 * whether or not the receiver runs the team build. The relay is unchanged.
 */
export type GroupMention = "all" | "everyone";

/** Upper bound on recipients one message can carry (was 32 upstream). */
export const MAX_MENTION_RECIPIENTS = 300;

// Code spans and fenced blocks never count; neither do e-mail addresses,
// URL paths or longer words such as @allison.
const CODE = /```[\s\S]*?```|`[^`\n]*`/g;
const TOKEN = /(^|[^\w@/.-])@(all|everyone)(?![\w-])/gi;

/** The group mentions written in a message, outside code. */
export function groupMentions(content: string): Set<GroupMention> {
  const found = new Set<GroupMention>();
  const text = content.replace(CODE, " ");
  for (const match of text.matchAll(TOKEN))
    found.add((match[2] ?? "").toLowerCase() as GroupMention);
  return found;
}

/**
 * Recipients for the group mentions in `content`: channel members other than
 * the sender, without agents for `@everyone`. Explicit mentions are kept.
 */
export function expandGroupMentions(
  content: string,
  explicit: readonly string[],
  members: readonly string[] | undefined,
  sender: string | undefined,
  isAgent: (pubkey: string) => boolean,
): string[] {
  const groups = groupMentions(content);
  if (!groups.size || !members?.length) return [...explicit];
  const everyoneOnly = !groups.has("all");
  const added = members.filter(
    (pubkey) => pubkey !== sender && (!everyoneOnly || !isAgent(pubkey)),
  );
  return [...new Set([...explicit, ...added])];
}
