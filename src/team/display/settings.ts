/** Chat display (Buzz Team): how this device shows conversations and the app. */
export const TEXT_SIZES = [
  { id: "small", label: "작게", zoom: 0.9 },
  { id: "normal", label: "보통", zoom: 1 },
  { id: "large", label: "크게", zoom: 1.15 },
  { id: "larger", label: "더 크게", zoom: 1.3 },
] as const;
export const WIDTHS = [
  { id: "normal", label: "기본", measure: "52rem", body: "46rem" },
  { id: "wide", label: "넓게", measure: "72rem", body: "66rem" },
  { id: "full", label: "화면 가득", measure: "100%", body: "100%" },
] as const;
export const DENSITIES = [
  { id: "compact", label: "촘촘하게", space: 0.5 },
  { id: "normal", label: "보통", space: 1 },
  { id: "roomy", label: "넓게", space: 1.6 },
] as const;
export const AVATARS = [
  { id: "small", label: "작게", zoom: 0.8 },
  { id: "normal", label: "보통", zoom: 1 },
  { id: "large", label: "크게", zoom: 1.25 },
] as const;
export const FONTS = [
  { id: "default", label: "기본", stack: "" },
  {
    id: "gothic",
    label: "애플 SD 고딕",
    stack: '"Apple SD Gothic Neo", system-ui, -apple-system, sans-serif',
  },
  {
    id: "system",
    label: "시스템",
    stack: "system-ui, -apple-system, sans-serif",
  },
  {
    id: "myungjo",
    label: "명조",
    stack: '"AppleMyungjo", "Nanum Myeongjo", serif',
  },
] as const;
/** Dark mode surfaces: the app's own, this build's default, or lighter. */
export const DARK_LEVELS = [
  { id: "dim", label: "어둡게" },
  { id: "normal", label: "보통" },
  { id: "bright", label: "밝게" },
] as const;
const MAX_HIDDEN_TABS = 20;
/** The Messages tab is how members get back; it never hides. */
export const ALWAYS_SHOWN_TAB = "buzz.channels/channels";

type Id<T extends readonly { id: string }[]> = T[number]["id"];
export type DisplaySettings = Readonly<{
  text: Id<typeof TEXT_SIZES>;
  width: Id<typeof WIDTHS>;
  density: Id<typeof DENSITIES>;
  avatar: Id<typeof AVATARS>;
  font: Id<typeof FONTS>;
  dark: Id<typeof DARK_LEVELS>;
  /** Top tabs this member hides; the Messages tab is never hidden. */
  hiddenTabs: readonly string[];
}>;
export const DEFAULT_DISPLAY: DisplaySettings = {
  text: "normal",
  width: "normal",
  density: "normal",
  avatar: "normal",
  font: "default",
  dark: "normal",
  hiddenTabs: [],
};

const pick = <T extends readonly { id: string }[]>(
  options: T,
  value: unknown,
  fallback: Id<T>,
): Id<T> => options.find(({ id }) => id === value)?.id ?? fallback;

export function decodeDisplay(raw: string | null): DisplaySettings {
  try {
    const value = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    return parseDisplay(value);
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function parseDisplay(value: Record<string, unknown>): DisplaySettings {
  const tabs = Array.isArray(value.hiddenTabs) ? value.hiddenTabs : [];
  return {
    text: pick(TEXT_SIZES, value.text, DEFAULT_DISPLAY.text),
    width: pick(WIDTHS, value.width, DEFAULT_DISPLAY.width),
    density: pick(DENSITIES, value.density, DEFAULT_DISPLAY.density),
    avatar: pick(AVATARS, value.avatar, DEFAULT_DISPLAY.avatar),
    font: pick(FONTS, value.font, DEFAULT_DISPLAY.font),
    dark: pick(DARK_LEVELS, value.dark, DEFAULT_DISPLAY.dark),
    hiddenTabs: [
      ...new Set(
        tabs.filter(
          (tab): tab is string =>
            typeof tab === "string" &&
            tab.length > 0 &&
            tab.length <= 128 &&
            tab !== ALWAYS_SHOWN_TAB,
        ),
      ),
    ].slice(0, MAX_HIDDEN_TABS),
  };
}

export function displayStyle(settings: DisplaySettings) {
  const font = FONTS.find(({ id }) => id === settings.font)?.stack ?? "";
  return {
    "--team-message-zoom": String(
      TEXT_SIZES.find(({ id }) => id === settings.text)?.zoom ?? 1,
    ),
    "--team-timeline-measure":
      WIDTHS.find(({ id }) => id === settings.width)?.measure ?? "52rem",
    "--team-message-measure":
      WIDTHS.find(({ id }) => id === settings.width)?.body ?? "46rem",
    "--team-message-density": String(
      DENSITIES.find(({ id }) => id === settings.density)?.space ?? 1,
    ),
    "--team-avatar-zoom": String(
      AVATARS.find(({ id }) => id === settings.avatar)?.zoom ?? 1,
    ),
    // Empty leaves the app's own font.
    "--font-sans": font,
  };
}
