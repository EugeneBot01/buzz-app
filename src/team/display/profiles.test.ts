import { expect, it } from "vitest";
import { decodeProfiles, readProfile, saveProfile } from "./profiles";
import { DEFAULT_DISPLAY } from "./settings";

it("saves by name, newest first, replacing the same name", () => {
  const one = saveProfile(
    [],
    " 업무용 ",
    { ...DEFAULT_DISPLAY, font: "gothic" },
    1,
  );
  const two = saveProfile(one, "회의용", DEFAULT_DISPLAY, 2);
  const again = saveProfile(
    two,
    "업무용",
    { ...DEFAULT_DISPLAY, dark: "bright" },
    3,
  );
  expect(again.map((profile) => profile.name)).toEqual(["업무용", "회의용"]);
  expect(again[0]?.settings.dark).toBe("bright");
  expect(() => saveProfile(again, "   ", DEFAULT_DISPLAY)).toThrow();
});

it("survives a round trip and ignores broken entries", () => {
  const saved = JSON.stringify([
    ...saveProfile([], "업무용", DEFAULT_DISPLAY, 1),
    { name: "", settings: {}, savedAt: 1 },
    { name: "x", settings: [], savedAt: 1 },
    "nope",
  ]);
  expect(decodeProfiles(saved).map((profile) => profile.name)).toEqual([
    "업무용",
  ]);
  expect(decodeProfiles("not json")).toEqual([]);
});

it("applies what this version knows and reports the rest", () => {
  const { settings, skipped } = readProfile(
    {
      name: "옛 프로필",
      savedAt: 1,
      settings: {
        text: "large",
        font: "a-font-this-version-dropped",
        hiddenTabs: ["buzz.reminders/reminders", "gone.plugin/page"],
      },
    },
    ["buzz.reminders/reminders", "buzz.team.calendar/calendar"],
  );
  expect(settings.text).toBe("large");
  expect(settings.font).toBe("default");
  expect(settings.hiddenTabs).toEqual([
    "buzz.reminders/reminders",
    "gone.plugin/page",
  ]);
  expect(skipped).toEqual(["글꼴", "지금 없는 상단 탭 1개"]);
});
