import { useState } from "react";
import type { PluginModule } from "../../plugins/api";
import { Button } from "../../shared/design-system/ui/Button";
import {
  TEXT_SIZES,
  WIDTHS,
  decodeDisplay,
  displayStyle,
  type DisplaySettings,
} from "../../team/display/settings";
import "./dark.css";

export const inject = ["settingsCards"];

const KEY = "buzz-team-display.v1";

function read() {
  try {
    return decodeDisplay(window.localStorage.getItem(KEY));
  } catch {
    return decodeDisplay(null);
  }
}

function applyStyle(settings: DisplaySettings) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(displayStyle(settings)))
    root.style.setProperty(name, value);
}

function DisplaySettingsCard() {
  const [settings, setSettings] = useState(read);
  const change = (next: DisplaySettings) => {
    setSettings(next);
    applyStyle(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Without storage, the choice lasts until the app closes.
    }
  };
  return (
    <div className="flex flex-col gap-3 text-sm" data-no-translate="">
      <fieldset className="flex flex-wrap items-center gap-1 border-0 p-0">
        <legend className="pb-1 text-muted">채널 글자 크기</legend>
        {TEXT_SIZES.map(({ id, label }) => (
          <Button
            key={id}
            variant={settings.text === id ? "prominent" : "subtle"}
            aria-pressed={settings.text === id}
            onClick={() => change({ ...settings, text: id })}
          >
            {label}
          </Button>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap items-center gap-1 border-0 p-0">
        <legend className="pb-1 text-muted">대화 폭</legend>
        {WIDTHS.map(({ id, label }) => (
          <Button
            key={id}
            variant={settings.width === id ? "prominent" : "subtle"}
            aria-pressed={settings.width === id}
            onClick={() => change({ ...settings, width: id })}
          >
            {label}
          </Button>
        ))}
      </fieldset>
    </div>
  );
}

export const apply: PluginModule["apply"] = (ctx) => {
  applyStyle(read());
  ctx.settingsCards.register({
    id: "chat-display",
    title: "Chat display",
    component: DisplaySettingsCard,
  });
};
