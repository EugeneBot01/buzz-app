/** UI EDIT (Buzz Team): how this device shows conversations and the app. */
/** Percentage sliders: range, default, and the older named choices they replace. */
export const SLIDERS = {
  text: {
    label: "채널 글자 크기",
    min: 80,
    max: 150,
    step: 5,
    base: 100,
    legacy: { small: 90, normal: 100, large: 115, larger: 130 },
  },
  density: {
    label: "메시지 간격",
    min: 30,
    max: 200,
    step: 10,
    base: 100,
    legacy: { compact: 50, normal: 100, roomy: 160 },
  },
  avatar: {
    label: "프로필 사진 크기",
    min: 60,
    max: 160,
    step: 5,
    base: 100,
    legacy: { small: 80, normal: 100, large: 125 },
  },
  // 0% is the app's own dark colors, 100% the lightest this build offers.
  dark: {
    label: "다크모드 밝기",
    min: 0,
    max: 100,
    step: 5,
    base: 70,
    legacy: { dim: 0, normal: 70, bright: 100 },
  },
} as const;
export type SliderName = keyof typeof SLIDERS;
export const WIDTHS = [
  { id: "normal", label: "기본", measure: "52rem", body: "46rem" },
  { id: "wide", label: "넓게", measure: "72rem", body: "66rem" },
  { id: "full", label: "화면 가득", measure: "100%", body: "100%" },
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
const MAX_HIDDEN_TABS = 20;
/** The Messages tab is how members get back; it never hides. */
export const ALWAYS_SHOWN_TAB = "buzz.channels/channels";

type Id<T extends readonly { id: string }[]> = T[number]["id"];
export type DisplaySettings = Readonly<{
  /** Percentages, within each slider's range. */
  text: number;
  density: number;
  avatar: number;
  dark: number;
  width: Id<typeof WIDTHS>;
  font: Id<typeof FONTS>;
  /** Top tabs this member hides; the Messages tab is never hidden. */
  hiddenTabs: readonly string[];
  /** Top tabs in the member's order, after Messages; others follow as the app orders them. */
  tabOrder: readonly string[];
  /** Message actions: a right-click menu (KakaoTalk style) or the hover toolbar. */
  messageMenu: "context" | "toolbar";
  /** Own messages on the right, others on the left, in bubbles. */
  bubbles: boolean;
  /** Chat background picture as a data URL, or none. */
  background: string | null;
}>;
/** Largest background picture kept, as a data URL (device storage is small). */
export const MAX_BACKGROUND = 1_500_000;
export const DEFAULT_DISPLAY: DisplaySettings = {
  text: SLIDERS.text.base,
  density: SLIDERS.density.base,
  avatar: SLIDERS.avatar.base,
  dark: SLIDERS.dark.base,
  width: "normal",
  font: "default",
  hiddenTabs: [],
  tabOrder: [],
  messageMenu: "context",
  bubbles: false,
  background: null,
};

const pick = <T extends readonly { id: string }[]>(
  options: T,
  value: unknown,
  fallback: Id<T>,
): Id<T> => options.find(({ id }) => id === value)?.id ?? fallback;

/** A slider value from a number, or from the named choice older builds saved;
 * undefined when it is neither. */
export function sliderValue(name: SliderName, value: unknown) {
  const { min, max, legacy } = SLIDERS[name];
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? (legacy as Record<string, number>)[value]
        : undefined;
  if (number === undefined || !Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, Math.round(number)));
}
const slider = (name: SliderName, value: unknown) =>
  sliderValue(name, value) ?? SLIDERS[name].base;

export function decodeDisplay(raw: string | null): DisplaySettings {
  try {
    const value = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    return parseDisplay(value);
  } catch {
    return DEFAULT_DISPLAY;
  }
}

const tabList = (value: unknown) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : []).filter(
        (tab): tab is string =>
          typeof tab === "string" &&
          tab.length > 0 &&
          tab.length <= 128 &&
          tab !== ALWAYS_SHOWN_TAB,
      ),
    ),
  ].slice(0, MAX_HIDDEN_TABS);

export function parseDisplay(value: Record<string, unknown>): DisplaySettings {
  return {
    text: slider("text", value.text),
    density: slider("density", value.density),
    avatar: slider("avatar", value.avatar),
    dark: slider("dark", value.dark),
    width: pick(WIDTHS, value.width, DEFAULT_DISPLAY.width),
    font: pick(FONTS, value.font, DEFAULT_DISPLAY.font),
    hiddenTabs: tabList(value.hiddenTabs),
    tabOrder: tabList(value.tabOrder),
    messageMenu: value.messageMenu === "toolbar" ? "toolbar" : "context",
    bubbles: value.bubbles === true,
    background:
      typeof value.background === "string" &&
      value.background.length <= MAX_BACKGROUND &&
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(
        value.background,
      )
        ? value.background
        : null,
  };
}

// The app's own dark surfaces, and the lightest this build offers.
const DARK_FROM = [0x00, 0x10, 0x1a, 0x23, 0x33, 0x40];
const DARK_TO = [0x26, 0x2e, 0x38, 0x43, 0x50, 0x5e];

/** Dark surface greys for a brightness percentage, computed here rather than
 * with CSS color-mix so older macOS WebKit shows them too. */
export function darkSurfaces(percent: number) {
  return Object.fromEntries(
    DARK_FROM.map((from, index) => {
      const to = DARK_TO[index] ?? from;
      const grey = Math.round(from + ((to - from) * percent) / 100)
        .toString(16)
        .padStart(2, "0");
      return [`--team-dark-${index + 1}`, `#${grey}${grey}${grey}`];
    }),
  );
}

export function displayStyle(settings: DisplaySettings) {
  const font = FONTS.find(({ id }) => id === settings.font)?.stack ?? "";
  return {
    "--team-message-zoom": String(settings.text / 100),
    "--team-timeline-measure":
      WIDTHS.find(({ id }) => id === settings.width)?.measure ?? "52rem",
    "--team-message-measure":
      WIDTHS.find(({ id }) => id === settings.width)?.body ?? "46rem",
    "--team-message-density": String(settings.density / 100),
    "--team-avatar-zoom": String(settings.avatar / 100),
    ...darkSurfaces(settings.dark),
    // Empty leaves the app's own font.
    "--font-sans": font,
  };
}

/** Top tabs in the member's order: Messages first, then their order, then the rest. */
export function orderTabs<T extends { key: string }>(
  pages: readonly T[],
  order: readonly string[],
): T[] {
  const rank = (page: T) => {
    if (page.key === ALWAYS_SHOWN_TAB) return -1;
    const at = order.indexOf(page.key);
    return at === -1 ? order.length : at;
  };
  // Stable: pages the member never ordered keep the app's order.
  return pages
    .map((page, index) => ({ page, index }))
    .sort((a, b) => rank(a.page) - rank(b.page) || a.index - b.index)
    .map(({ page }) => page);
}
