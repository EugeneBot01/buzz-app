import { describe, expect, it } from "vitest";
import {
  parseDisplay,
  DEFAULT_DISPLAY,
  decodeDisplay,
  darkSurfaces,
  displayStyle,
  orderTabs,
} from "./settings";

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
        text: 115,
        width: "wide",
        density: 50,
        avatar: 125,
        font: "gothic",
      }),
    ).toEqual({
      "--team-message-zoom": "1.15",
      "--team-timeline-measure": "72rem",
      "--team-message-measure": "66rem",
      "--team-message-density": "0.5",
      "--team-avatar-zoom": "1.25",
      "--team-dark-1": "#1b1b1b",
      "--team-dark-2": "#252525",
      "--team-dark-3": "#2f2f2f",
      "--team-dark-4": "#393939",
      "--team-dark-5": "#474747",
      "--team-dark-6": "#555555",
      "--font-sans":
        '"Apple SD Gothic Neo", system-ui, -apple-system, sans-serif',
    });
    // The default font leaves the app's own.
    expect(displayStyle(DEFAULT_DISPLAY)["--font-sans"]).toBe("");
  });

  it("keeps only a picture as the chat background", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(parseDisplay({ background: png }).background).toBe(png);
    expect(parseDisplay({ background: 'x");}' }).background).toBeNull();
    expect(
      parseDisplay({ background: "javascript:alert(1)" }).background,
    ).toBeNull();
    expect(parseDisplay({}).messageMenu).toBe("context");
    expect(parseDisplay({ bubbles: true }).bubbles).toBe(true);
  });

  it("orders top tabs: Messages first, then the member's order, then the rest", () => {
    const pages = [
      { key: "buzz.reminders/reminders" },
      { key: "buzz.channels/channels" },
      { key: "buzz.team.calendar/calendar" },
      { key: "buzz.agents/agents" },
    ];
    expect(
      orderTabs(pages, ["buzz.team.calendar/calendar"]).map((page) => page.key),
    ).toEqual([
      "buzz.channels/channels",
      "buzz.team.calendar/calendar",
      "buzz.reminders/reminders",
      "buzz.agents/agents",
    ]);
  });

  it("reads percentages, and older named choices as their percentages", () => {
    const old = decodeDisplay(
      JSON.stringify({
        text: "large",
        density: "roomy",
        avatar: 999,
        dark: "dim",
      }),
    );
    expect(old.text).toBe(115);
    expect(old.density).toBe(160);
    expect(old.avatar).toBe(160);
    expect(old.dark).toBe(0);
    expect(decodeDisplay('{"text":"huge"}').text).toBe(100);
  });

  it("keeps the app's own dark colors at 0% and the lightest at 100%", () => {
    expect(darkSurfaces(0)["--team-dark-1"]).toBe("#000000");
    expect(darkSurfaces(100)["--team-dark-6"]).toBe("#5e5e5e");
  });
});
