/**
 * Team app data (Buzz Team): plaintext kind-30078 documents the team build
 * shares within a community, such as the team calendar. Only these `d`
 * prefixes may be signed; everything else keeps the app's own rules.
 */
export const TEAM_APP_DATA_PREFIXES = [
  "team-calendar:",
  "team-calendar-polls:",
  "team-calendar-digest:",
  "team-sections:",
  "team-shortcuts:",
  "team-onboarding:",
] as const;

/** The largest document the relay keeps comfortably (about 60 KB). */
export const TEAM_APP_DATA_MAX_BYTES = 60 * 1024;

export type TeamAppDataTemplate = Readonly<{
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}>;

export function isTeamAppData(
  template: Pick<TeamAppDataTemplate, "kind" | "tags" | "content">,
) {
  if (template.kind !== 30078) return false;
  if (
    new TextEncoder().encode(template.content).length > TEAM_APP_DATA_MAX_BYTES
  )
    return false;
  const d = template.tags.filter((tag) => tag[0] === "d");
  const t = template.tags.filter((tag) => tag[0] === "t");
  return (
    d.length === 1 &&
    t.length <= 1 &&
    template.tags.length === d.length + t.length &&
    TEAM_APP_DATA_PREFIXES.some((prefix) => d[0]?.[1]?.startsWith(prefix)) &&
    (d[0]?.[1]?.length ?? 0) <= 256 &&
    (!t[0] || /^team-[a-z-]{1,40}$/.test(t[0][1] ?? ""))
  );
}
