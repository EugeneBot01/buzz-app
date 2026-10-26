import type { CompletionSuggestion } from "../../features/conversation/contracts";

const GROUPS = [
  { key: "all", detail: "Everyone in this channel, agents included" },
  { key: "everyone", detail: "Every person in this channel (no agents)" },
] as const;

/** `@all` / `@everyone` suggestions for a channel (never in DMs). */
export function groupMentionSuggestions(
  query: string,
  channelType: string | undefined,
): CompletionSuggestion[] {
  if (channelType === "dm") return [];
  const typed = query.trim().toLowerCase();
  // Two letters or more ("@al", "@ev") so short searches stay about people.
  if (typed.length < 2 || typed.includes(" ")) return [];
  return GROUPS.filter(({ key }) => key.startsWith(typed)).map(
    ({ key, detail }) => ({
      id: `team-group-${key}`,
      label: key,
      detail,
      edit: { text: `@${key} ` },
    }),
  );
}
