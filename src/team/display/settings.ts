/** Chat display (Buzz Team): this device's text size and conversation width. */
export const TEXT_SIZES = [
  { id: "small", label: "작게", zoom: 0.9 },
  { id: "normal", label: "보통", zoom: 1 },
  { id: "large", label: "크게", zoom: 1.15 },
  { id: "larger", label: "더 크게", zoom: 1.3 },
] as const;
export const WIDTHS = [
  { id: "normal", label: "기본", measure: "52rem" },
  { id: "wide", label: "넓게", measure: "72rem" },
  { id: "full", label: "화면 가득", measure: "100%" },
] as const;

export type DisplaySettings = Readonly<{
  text: (typeof TEXT_SIZES)[number]["id"];
  width: (typeof WIDTHS)[number]["id"];
}>;
export const DEFAULT_DISPLAY: DisplaySettings = {
  text: "normal",
  width: "normal",
};

export function decodeDisplay(raw: string | null): DisplaySettings {
  try {
    const { text, width } = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    return {
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
  };
}
