/** Chat display (Buzz Team): this device's app size, text size and conversation width. */
export const UI_SCALES = [
  { id: "90", label: "90%", zoom: 0.9 },
  { id: "100", label: "100%", zoom: 1 },
  { id: "110", label: "110%", zoom: 1.1 },
  { id: "120", label: "120%", zoom: 1.2 },
  { id: "135", label: "135%", zoom: 1.35 },
] as const;
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

export type DisplaySettings = Readonly<{
  ui: (typeof UI_SCALES)[number]["id"];
  text: (typeof TEXT_SIZES)[number]["id"];
  width: (typeof WIDTHS)[number]["id"];
}>;
export const DEFAULT_DISPLAY: DisplaySettings = {
  ui: "100",
  text: "normal",
  width: "normal",
};

export function decodeDisplay(raw: string | null): DisplaySettings {
  try {
    const { ui, text, width } = JSON.parse(raw ?? "{}") as Record<
      string,
      unknown
    >;
    return {
      ui: UI_SCALES.find(({ id }) => id === ui)?.id ?? DEFAULT_DISPLAY.ui,
      text:
        TEXT_SIZES.find(({ id }) => id === text)?.id ?? DEFAULT_DISPLAY.text,
      width: WIDTHS.find(({ id }) => id === width)?.id ?? DEFAULT_DISPLAY.width,
    };
  } catch {
    return DEFAULT_DISPLAY;
  }
}

export function displayStyle({ text, width }: DisplaySettings) {
  return {
    "--team-message-zoom": String(
      TEXT_SIZES.find(({ id }) => id === text)?.zoom ?? 1,
    ),
    "--team-timeline-measure":
      WIDTHS.find(({ id }) => id === width)?.measure ?? "52rem",
    "--team-message-measure":
      WIDTHS.find(({ id }) => id === width)?.body ?? "46rem",
  };
}

export const uiZoom = ({ ui }: DisplaySettings) =>
  UI_SCALES.find(({ id }) => id === ui)?.zoom ?? 1;
