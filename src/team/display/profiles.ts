/**
 * UI profiles (Buzz Team): named snapshots of UI EDIT choices. Applying one
 * keeps whatever this version still understands and reports the rest, so a
 * profile survives app updates that rename or remove a choice.
 */
import {
  type DisplaySettings,
  FONTS,
  parseDisplay,
  SLIDERS,
  sliderValue,
  WIDTHS,
} from "./settings";

export const MAX_PROFILES = 20;
export const MAX_PROFILE_NAME = 40;

export type UiProfile = Readonly<{
  name: string;
  /** As saved; read again through `parseDisplay` every time it is applied. */
  settings: Readonly<Record<string, unknown>>;
  /** The workspace panel arrangement, when one was saved with it. */
  workspace?: unknown;
  savedAt: number;
  /** Communities (their shared-profile `d` tags) this profile is shared in. */
  sharedIn?: readonly string[];
}>;

const CHOICES = {
  width: ["대화 폭", WIDTHS],
  font: ["글꼴", FONTS],
} as const;

export function decodeProfiles(raw: string | null): UiProfile[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is UiProfile =>
          !!item &&
          typeof item === "object" &&
          typeof item.name === "string" &&
          item.name.trim().length > 0 &&
          item.name.length <= MAX_PROFILE_NAME &&
          !!item.settings &&
          typeof item.settings === "object" &&
          !Array.isArray(item.settings) &&
          typeof item.savedAt === "number",
      )
      .slice(0, MAX_PROFILES);
  } catch {
    return [];
  }
}

/** Saves under `name`, replacing a profile with the same name. */
export function saveProfile(
  profiles: readonly UiProfile[],
  name: string,
  settings: DisplaySettings,
  now = Date.now(),
  workspace?: unknown,
): UiProfile[] {
  const trimmed = name.trim().slice(0, MAX_PROFILE_NAME);
  if (!trimmed) throw new Error("프로필 이름을 적어 주세요.");
  const rest = profiles.filter((profile) => profile.name !== trimmed);
  const before = profiles.find((profile) => profile.name === trimmed);
  if (rest.length >= MAX_PROFILES)
    throw new Error(`프로필은 ${MAX_PROFILES}개까지 저장할 수 있어요.`);
  return [
    {
      name: trimmed,
      // The background picture is this device's own and too big to keep per
      // profile or share; applying a profile leaves it as it is.
      settings: { ...settings, background: null },
      ...(workspace === undefined ? {} : { workspace }),
      savedAt: now,
      ...(before?.sharedIn?.length ? { sharedIn: before.sharedIn } : {}),
    },
    ...rest,
  ];
}

/** Renames a profile; the new name must be free. */
export function renameProfile(
  profiles: readonly UiProfile[],
  from: string,
  to: string,
): UiProfile[] {
  const name = to.trim().slice(0, MAX_PROFILE_NAME);
  if (!name) throw new Error("프로필 이름을 적어 주세요.");
  if (name !== from && profiles.some((profile) => profile.name === name))
    throw new Error(`"${name}" 이름의 프로필이 이미 있어요.`);
  return profiles.map((profile) =>
    profile.name === from ? { ...profile, name } : profile,
  );
}

/** Shares or stops sharing a profile in one community; at most `limit` there. */
export function shareProfile(
  profiles: readonly UiProfile[],
  name: string,
  community: string,
  shared: boolean,
  limit: number,
): UiProfile[] {
  if (
    shared &&
    profiles.filter(
      (profile) =>
        profile.name !== name && profile.sharedIn?.includes(community),
    ).length >= limit
  )
    throw new Error(`공유는 ${limit}개까지 할 수 있어요.`);
  return profiles.map((profile) => {
    if (profile.name !== name) return profile;
    const rest = (profile.sharedIn ?? []).filter((tag) => tag !== community);
    return { ...profile, sharedIn: shared ? [...rest, community] : rest };
  });
}

/** What a teammate sees: the look and tabs only, never the work area layout
 * or where it is shared. */
export const publicProfile = ({ name, settings, savedAt }: UiProfile) => ({
  name,
  settings,
  savedAt,
});

/**
 * The settings a profile gives on this version, and what it could not apply:
 * choices this version does not have, and top tabs that are not here now.
 */
export function readProfile(
  profile: UiProfile,
  tabsHere: readonly string[],
): { settings: DisplaySettings; skipped: string[] } {
  const parsed = parseDisplay(profile.settings);
  const skipped: string[] = [];
  for (const [key, [label, options]] of Object.entries(CHOICES)) {
    const saved = profile.settings[key];
    if (saved !== undefined && !options.some(({ id }) => id === saved))
      skipped.push(label);
  }
  for (const [key, { label }] of Object.entries(SLIDERS)) {
    const saved = profile.settings[key];
    if (
      saved !== undefined &&
      sliderValue(key as keyof typeof SLIDERS, saved) === undefined
    )
      skipped.push(label);
  }
  const missing = parsed.hiddenTabs.filter((tab) => !tabsHere.includes(tab));
  // Kept anyway: a tab that comes back later stays hidden as saved.
  if (missing.length) skipped.push(`지금 없는 상단 탭 ${missing.length}개`);
  return { settings: parsed, skipped };
}
