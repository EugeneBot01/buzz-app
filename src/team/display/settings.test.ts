import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY, decodeDisplay, displayStyle } from "./settings";

describe("chat display settings", () => {
  it("falls back to defaults for missing or broken values", () => {
    expect(decodeDisplay(null)).toEqual(DEFAULT_DISPLAY);
    expect(decodeDisplay("not json")).toEqual(DEFAULT_DISPLAY);
    expect(decodeDisplay('{"text":"huge","width":"full"}')).toEqual({
      text: "normal",
      width: "full",
    });
  });

  it("turns choices into the values the timeline reads", () => {
    expect(displayStyle({ text: "large", width: "wide" })).toEqual({
      "--team-message-zoom": "1.15",
      "--team-timeline-measure": "72rem",
      "--team-message-measure": "66rem",
    });
  });
});
