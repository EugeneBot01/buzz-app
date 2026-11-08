/**
 * UI profiles (Buzz Team): named snapshots of UI EDIT choices. Applying one
 * keeps whatever this version still understands and reports the rest, so a
 * profile survives app updates that rename or remove a choice.
 */
import {
  AVATARS,
  DARK_LEVELS,
  DENSITIES,
  type DisplaySettings,
  FONTS,
  parseDisplay,
  TEXT_SIZES,
  WIDTHS,
} from "./settings";

export const MAX_PROFILES = 20;
export const MAX_PROFILE_NAME = 40;

export type UiProfile = Readonly<{
  name: string;
  /** As saved; read again through `parseDisplay` every time it is applied. */
  settings: Readonly<Record<string, unknown>>;
  savedAt: number;
}>;

const CHOICES = {
  text: ["채널 글자 크기", TEXT_SIZES],
  width: ["대화 폭", WIDTHS],
  density: ["메시지 간격", DENSITIES],
  avatar: ["프로필 사진 크기", AVATARS],
  font: ["글꼴", FONTS],
  dark: ["다크모드 밝기", DARK_LEVELS],
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
): UiProfile[] {
  const trimmed = name.trim().slice(0, MAX_PROFILE_NAME);
  if (!trimmed) throw new Error("프로필 이름을 적어 주세요.");
  const rest = profiles.filter((profile) => profile.name !== trimmed);
  if (rest.length >= MAX_PROFILES)
    throw new Error(`프로필은 ${MAX_PROFILES}개까지 저장할 수 있어요.`);
  return [{ name: trimmed, settings: { ...settings }, savedAt: now }, ...rest];
}

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
  const missing = parsed.hiddenTabs.filter((tab) => !tabsHere.includes(tab));
  // Kept anyway: a tab that comes back later stays hidden as saved.
  if (missing.length) skipped.push(`지금 없는 상단 탭 ${missing.length}개`);
  return { settings: parsed, skipped };
}
