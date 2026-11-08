import { useState, useSyncExternalStore } from "react";
import type { PluginModule } from "../../plugins/api";
import type { PagesReader } from "../../features/pages/service";
import { Button } from "../../shared/design-system/ui/Button";
import { Input } from "../../shared/design-system/ui/Input";
import {
  orderPages,
  pagePlacement,
  pagePresentation,
} from "../../app/shell/presentation";
import {
  ALWAYS_SHOWN_TAB,
  DEFAULT_DISPLAY,
  type DisplaySettings,
  FONTS,
  orderTabs,
  SLIDERS,
  type SliderName,
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

/** Drag to change; the percentage shows beside the bar as it moves. */
function Slider({
  name,
  settings,
}: {
  name: SliderName;
  settings: DisplaySettings;
}) {
  const { label, min, max, step } = SLIDERS[name];
  const id = `ui-edit-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-muted">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={settings[name]}
          className="min-w-0 flex-1 accent-[var(--accent-9)]"
          onChange={(event) =>
            displaySettings.change({
              ...settings,
              [name]: Number(event.target.value),
            })
          }
        />
        <output htmlFor={id} className="w-12 text-right tabular-nums">
          {settings[name]}%
        </output>
      </div>
    </div>
  );
}

/** A small conversation drawn with the current choices, so changes show here
 * before closing Settings. */
function Preview() {
  const avatar =
    "calc(var(--size-control-sm, 2rem) * var(--team-avatar-zoom, 1))";
  const rows = [
    {
      who: "성태엄마",
      tone: "var(--accent-9)",
      text: "오늘 회의 자료 올렸어요. 확인 부탁해요!",
    },
    {
      who: "EGB01",
      tone: "var(--neutral-8)",
      text: "확인했어요. 수정할 부분은 스레드에 적을게요.",
    },
  ];
  return (
    <section
      aria-label="미리보기"
      className="overflow-hidden rounded-lg border"
      style={{
        background: "var(--bg-app, var(--neutral-1))",
        borderColor: "var(--border-standard)",
        fontFamily: "var(--font-sans)",
        padding: "var(--space-3)",
      }}
    >
      <p className="pb-2 text-muted">미리보기</p>
      <div style={{ zoom: "var(--team-message-zoom, 1)" }}>
        {rows.map((row) => (
          <div
            key={row.who}
            className="flex items-start gap-3"
            style={{
              paddingBlock:
                "calc((var(--space-3) + var(--space-half)) * var(--team-message-density, 1) / 2)",
            }}
          >
            <span
              aria-hidden="true"
              className="shrink-0 rounded-full"
              style={{ width: avatar, height: avatar, background: row.tone }}
            />
            <div
              className="min-w-0 rounded-lg px-3 py-2"
              style={{ background: "var(--neutral-3)" }}
            >
              <div className="text-muted">{row.who}</div>
              <div>{row.text}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Save the current look under a name, switch between saved looks, and put
 * the last one back after an update moved things around. */
function Profiles({ tabsHere }: { tabsHere: readonly string[] }) {
  const profiles = useSyncExternalStore(
    displaySettings.subscribe,
    displaySettings.profiles,
  );
  const last = useSyncExternalStore(
    displaySettings.subscribe,
    displaySettings.lastProfile,
  );
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const run = (action: () => string) => {
    try {
      setStatus(action());
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const applied = (profile: string, skipped: readonly string[]) =>
    skipped.length
      ? `"${profile}" 적용함. 이번 버전에서 적용 못 한 항목: ${skipped.join(", ")}`
      : `"${profile}" 적용함.`;
  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="pb-1 text-muted">UI 프로필</legend>
      <div className="flex flex-wrap items-center gap-1">
        <Input
          aria-label="프로필 이름"
          placeholder="이름 (예: 업무용)"
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          disabled={!name.trim()}
          onClick={() =>
            run(() => {
              displaySettings.saveProfile(name);
              setName("");
              return `"${name.trim()}"로 저장했어요.`;
            })
          }
        >
          지금 모습 저장
        </Button>
        {last && profiles.some((profile) => profile.name === last) && (
          <Button
            variant="prominent"
            onClick={() =>
              run(() =>
                applied(last, displaySettings.applyProfile(last, tabsHere)),
              )
            }
          >
            다시 적용 ({last})
          </Button>
        )}
      </div>
      {profiles.map((profile) => (
        <div key={profile.name} className="flex flex-wrap items-center gap-1">
          <span className="min-w-0 flex-1 truncate">
            {profile.name === last ? "● " : ""}
            {profile.name}
          </span>
          <Button
            size="sm"
            onClick={() =>
              run(() =>
                applied(
                  profile.name,
                  displaySettings.applyProfile(profile.name, tabsHere),
                ),
              )
            }
          >
            적용
          </Button>
          <Button
            size="sm"
            variant="subtle"
            onClick={() =>
              run(() => {
                displaySettings.deleteProfile(profile.name);
                return `"${profile.name}"를 지웠어요.`;
              })
            }
          >
            삭제
          </Button>
        </div>
      ))}
      {status && <p role="status">{status}</p>}
    </fieldset>
  );
}

function DisplaySettingsCard({ pages }: { pages: PagesReader }) {
  const settings = useSyncExternalStore(
    displaySettings.subscribe,
    displaySettings.snapshot,
  );
  const all = useSyncExternalStore(pages.subscribe, pages.snapshot);
  const tabs = orderTabs(
    orderPages(
      all.filter(
        (page) =>
          pagePlacement(page) === "topbar" && page.key !== ALWAYS_SHOWN_TAB,
      ),
    ),
    settings.tabOrder,
  );
  const moveTab = (index: number, by: -1 | 1) => {
    const keys = tabs.map((page) => page.key);
    const [moved] = keys.splice(index, 1);
    if (moved === undefined) return;
    keys.splice(index + by, 0, moved);
    displaySettings.change({ ...settings, tabOrder: keys });
  };
  const toggleTab = (key: string) =>
    displaySettings.change({
      ...settings,
      hiddenTabs: settings.hiddenTabs.includes(key)
        ? settings.hiddenTabs.filter((tab) => tab !== key)
        : [...settings.hiddenTabs, key],
    });
  return (
    <div className="flex flex-col gap-3 text-sm">
      <Profiles tabsHere={all.map((page) => page.key)} />
      <p className="text-muted">
        화면 전체 크기는 Appearance의 Interface size나 ⌘+ / ⌘−로 바꿀 수 있어요.
      </p>
      <Preview />
      <Slider name="text" settings={settings} />
      <Slider name="density" settings={settings} />
      <Slider name="avatar" settings={settings} />
      <Slider name="dark" settings={settings} />
      <Choices
        legend="대화 폭"
        name="width"
        options={WIDTHS}
        settings={settings}
      />
      <Choices legend="글꼴" name="font" options={FONTS} settings={settings} />
      {tabs.length > 0 && (
        <fieldset className="flex flex-wrap items-center gap-1 border-0 p-0">
          <legend className="pb-1 text-muted">
            상단 탭 (보이기 · 순서, 메시지 탭은 항상 맨 앞)
          </legend>
          {tabs.map((page, index) => {
            const shown = !settings.hiddenTabs.includes(page.key);
            return (
              <span key={page.key} className="inline-flex items-center gap-1">
                <Button
                  variant={shown ? "prominent" : "subtle"}
                  aria-pressed={shown}
                  onClick={() => toggleTab(page.key)}
                >
                  {pagePresentation(page).label}
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  aria-label={`${pagePresentation(page).label} 앞으로`}
                  disabled={index === 0}
                  onClick={() => moveTab(index, -1)}
                >
                  ←
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  aria-label={`${pagePresentation(page).label} 뒤로`}
                  disabled={index === tabs.length - 1}
                  onClick={() => moveTab(index, 1)}
                >
                  →
                </Button>
              </span>
            );
          })}
        </fieldset>
      )}
      <div>
        <Button
          variant="subtle"
          onClick={() => displaySettings.change(DEFAULT_DISPLAY)}
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
    title: "UI EDIT",
    component: () => <DisplaySettingsCard pages={ctx.pages} />,
  });
};
