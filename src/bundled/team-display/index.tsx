import { useSyncExternalStore } from "react";
import type { PluginModule } from "../../plugins/api";
import type { PagesReader } from "../../features/pages/service";
import { Button } from "../../shared/design-system/ui/Button";
import { orderPages } from "../../app/shell/presentation";
import {
  ALWAYS_SHOWN_TAB,
  AVATARS,
  DARK_LEVELS,
  DENSITIES,
  type DisplaySettings,
  FONTS,
  TEXT_SIZES,
  WIDTHS,
} from "../../team/display/settings";
import { displaySettings } from "../../team/display/store";
import "./dark.css";

export const inject = ["settingsCards", "pages"];

function Choices<K extends keyof DisplaySettings>({
  legend,
  name,
  options,
  settings,
}: {
  legend: string;
  name: K;
  options: readonly { id: DisplaySettings[K] & string; label: string }[];
  settings: DisplaySettings;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-1 border-0 p-0">
      <legend className="pb-1 text-muted">{legend}</legend>
      {options.map(({ id, label }) => (
        <Button
          key={id}
          variant={settings[name] === id ? "prominent" : "subtle"}
          aria-pressed={settings[name] === id}
          onClick={() => displaySettings.change({ ...settings, [name]: id })}
        >
          {label}
        </Button>
      ))}
    </fieldset>
  );
}

function DisplaySettingsCard({ pages }: { pages: PagesReader }) {
  const settings = useSyncExternalStore(
    displaySettings.subscribe,
    displaySettings.snapshot,
  );
  const all = useSyncExternalStore(pages.subscribe, pages.snapshot);
  const tabs = orderPages(
    all.filter(
      (page) => page.placement === "topbar" && page.key !== ALWAYS_SHOWN_TAB,
    ),
  );
  const toggleTab = (key: string) =>
    displaySettings.change({
      ...settings,
      hiddenTabs: settings.hiddenTabs.includes(key)
        ? settings.hiddenTabs.filter((tab) => tab !== key)
        : [...settings.hiddenTabs, key],
    });
  return (
    <div className="flex flex-col gap-3 text-sm" data-no-translate="">
      <p className="text-muted">
        화면 전체 크기는 Appearance의 Interface size나 ⌘+ / ⌘−로 바꿀 수 있어요.
      </p>
      <Choices
        legend="채널 글자 크기"
        name="text"
        options={TEXT_SIZES}
        settings={settings}
      />
      <Choices
        legend="메시지 간격"
        name="density"
        options={DENSITIES}
        settings={settings}
      />
      <Choices
        legend="프로필 사진 크기"
        name="avatar"
        options={AVATARS}
        settings={settings}
      />
      <Choices
        legend="대화 폭"
        name="width"
        options={WIDTHS}
        settings={settings}
      />
      <Choices legend="글꼴" name="font" options={FONTS} settings={settings} />
      <Choices
        legend="다크모드 밝기"
        name="dark"
        options={DARK_LEVELS}
        settings={settings}
      />
      {tabs.length > 0 && (
        <fieldset className="flex flex-wrap items-center gap-1 border-0 p-0">
          <legend className="pb-1 text-muted">상단 탭 보이기</legend>
          {tabs.map((page) => {
            const shown = !settings.hiddenTabs.includes(page.key);
            return (
              <Button
                key={page.key}
                variant={shown ? "prominent" : "subtle"}
                aria-pressed={shown}
                onClick={() => toggleTab(page.key)}
              >
                {page.title}
              </Button>
            );
          })}
        </fieldset>
      )}
      <div>
        <Button
          variant="subtle"
          onClick={() =>
            displaySettings.change({
              ...settings,
              text: "normal",
              width: "normal",
              density: "normal",
              avatar: "normal",
              font: "default",
              dark: "normal",
              hiddenTabs: [],
            })
          }
        >
          모두 원래대로
        </Button>
      </div>
    </div>
  );
}

export const apply: PluginModule["apply"] = (ctx) => {
  ctx.effect(() => displaySettings.start());
  ctx.settingsCards.register({
    id: "chat-display",
    title: "Chat display",
    component: () => <DisplaySettingsCard pages={ctx.pages} />,
  });
};
