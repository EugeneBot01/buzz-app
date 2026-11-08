import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISPLAY,
  decodeDisplay,
  displayStyle,
  uiZoom,
} from "./settings";

describe("chat display settings", () => {
  it("falls back to defaults for missing or broken values", () => {
    expect(decodeDisplay(null)).toEqual(DEFAULT_DISPLAY);
    expect(decodeDisplay("not json")).toEqual(DEFAULT_DISPLAY);
    expect(decodeDisplay('{"text":"huge","width":"full"}')).toEqual({
      ui: "100",
      text: "normal",
      width: "full",
    });
  });

  it("turns choices into the values the timeline reads", () => {
    expect(displayStyle({ ui: "100", text: "large", width: "wide" })).toEqual({
      "--team-message-zoom": "1.15",
      "--team-timeline-measure": "72rem",
      "--team-message-measure": "66rem",
    });
  });

  it("remembers the whole-app size", () => {
    const saved = decodeDisplay('{"ui":"120"}');
    expect(saved.ui).toBe("120");
    expect(uiZoom(saved)).toBe(1.2);
    expect(uiZoom(decodeDisplay('{"ui":"500"}'))).toBe(1);
  });
});
