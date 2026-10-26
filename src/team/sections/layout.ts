/**
 * Team folders (Buzz Team): a sidebar folder layout an owner or admin shares
 * with the whole community. Members keep their own private folders; the team
 * layout only files channels a member has not filed themselves, into a folder
 * of the same name (created when missing).
 */
export const SECTIONS_TAG = "team-sections";
export const MAX_TEAM_SECTIONS = 40;
const MAX_CHANNELS = 500;

export const sectionsDTag = (relayUrl: string) => `${SECTIONS_TAG}:${relayUrl}`;

export type TeamSection = Readonly<{
  name: string;
  channels: readonly string[];
}>;
export type TeamLayout = Readonly<{
  version: 1;
  sections: readonly TeamSection[];
  updatedAt: number;
}>;
export type PersonalGroups = Readonly<{
  sections: readonly Readonly<{ id: string; name: string; order: number }>[];
  assignments: Readonly<Record<string, string>>;
}>;

const key = (name: string) => name.trim().toLocaleLowerCase();

/** A layout from the admin's own folders, in their sidebar order. */
export function layoutFromGroups(
  groups: PersonalGroups,
  now = Date.now(),
): TeamLayout {
  const byId = new Map<string, string[]>();
  for (const [channel, section] of Object.entries(groups.assignments))
    byId.set(section, [...(byId.get(section) ?? []), channel]);
  return {
    version: 1,
    sections: [...groups.sections]
      .sort((a, b) => a.order - b.order)
      .slice(0, MAX_TEAM_SECTIONS)
      .map(({ id, name }) => ({ name, channels: (byId.get(id) ?? []).sort() })),
    updatedAt: now,
  };
}

export function decodeLayout(content: string): TeamLayout | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { version, sections, updatedAt } = raw as Record<string, unknown>;
  if (version !== 1 || !Array.isArray(sections)) return null;
  const names = new Set<string>();
  const filed = new Set<string>();
  const valid: TeamSection[] = [];
  let total = 0;
  for (const entry of sections.slice(0, MAX_TEAM_SECTIONS)) {
    if (!entry || typeof entry !== "object") continue;
    const { name, channels } = entry as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim() || name.length > 120) continue;
    if (names.has(key(name))) continue;
    names.add(key(name));
    const ids: string[] = [];
    for (const id of Array.isArray(channels) ? channels : []) {
      if (typeof id !== "string" || !id || id.length > 128 || filed.has(id))
        continue;
      if (++total > MAX_CHANNELS) break;
      filed.add(id);
      ids.push(id);
    }
    valid.push({ name: name.trim(), channels: ids });
  }
  return {
    version: 1,
    sections: valid,
    updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
  };
}

/** The newest readable layout written by a current owner or admin. */
export function latestLayout(
  events: readonly { pubkey: string; content: string; created_at: number }[],
  managers: ReadonlySet<string>,
): TeamLayout | null {
  let best: { at: number; layout: TeamLayout } | undefined;
  for (const event of events) {
    if (!managers.has(event.pubkey)) continue;
    const layout = decodeLayout(event.content);
    if (layout && (!best || event.created_at > best.at))
      best = { at: event.created_at, layout };
  }
  return best?.layout ?? null;
}

export type FilingStep =
  | Readonly<{ channelId: string; sectionId: string }>
  | Readonly<{ channelId: string; create: { id: string; name: string } }>;

/**
 * Steps that file a member's joined, unfiled channels into the team folders.
 * A folder is created once, by its first channel; later channels join it.
 */
export function planFiling(
  layout: TeamLayout,
  personal: PersonalGroups,
  joined: ReadonlySet<string>,
  newId: () => string,
): FilingStep[] {
  const folders = new Map(
    personal.sections.map(({ id, name }) => [key(name), id] as const),
  );
  const steps: FilingStep[] = [];
  for (const section of layout.sections) {
    let folder = folders.get(key(section.name));
    for (const channelId of section.channels) {
      if (!joined.has(channelId) || personal.assignments[channelId]) continue;
      if (folder) steps.push({ channelId, sectionId: folder });
      else {
        folder = newId();
        folders.set(key(section.name), folder);
        steps.push({ channelId, create: { id: folder, name: section.name } });
      }
    }
  }
  return steps;
}
