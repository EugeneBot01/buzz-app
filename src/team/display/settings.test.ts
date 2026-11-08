import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY, decodeDisplay, displayStyle } from "./settings";

describe("chat display settings", () => {
  it("falls back to defaults for missing or broken values", () => {
    expect(decodeDisplay(null)).toEqual(DEFAULT_DISPLAY);
    expect(decodeDisplay("not json")).toEqual(DEFAULT_DISPLAY);
    expect(decodeDisplay('{"text":"huge","width":"full"}')).toEqual({
      ...DEFAULT_DISPLAY,
      width: "full",
    });
  });

  it("keeps only sensible hidden tabs, once each", () => {
    const saved = decodeDisplay(
      JSON.stringify({
        hiddenTabs: [
          "calendar",
          "calendar",
          3,
          "",
          "x".repeat(200),
          "buzz.channels/channels",
        ],
      }),
    );
    expect(saved.hiddenTabs).toEqual(["calendar"]);
  });

  it("turns choices into the values the app reads", () => {
    expect(
      displayStyle({
        ...DEFAULT_DISPLAY,
        text: "large",
        width: "wide",
        density: "compact",
        avatar: "large",
        font: "gothic",
      }),
    ).toEqual({
      "--team-message-zoom": "1.15",
      "--team-timeline-measure": "72rem",
      "--team-message-measure": "66rem",
      "--team-message-density": "0.5",
      "--team-avatar-zoom": "1.25",
      "--font-sans":
        '"Apple SD Gothic Neo", system-ui, -apple-system, sans-serif',
    });
    // The default font leaves the app's own.
    expect(displayStyle(DEFAULT_DISPLAY)["--font-sans"]).toBe("");
  });
});
