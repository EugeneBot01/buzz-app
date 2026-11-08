import { useEffect, useState, useSyncExternalStore } from "react";
import type { PluginModule } from "../../plugins/api";
import type { PagesReader } from "../../features/pages/service";
import type { RelayData } from "../../features/relay/service";
import {
  orderPages,
  pagePlacement,
  pagePresentation,
} from "../../app/shell/presentation";
import { DotsThreeIcon } from "../../shared/design-system/icons/index";
import { Button } from "../../shared/design-system/ui/Button";
import { InlineHeader } from "../../shared/design-system/ui/Header";
import { IconButton } from "../../shared/design-system/ui/IconButton";
import { Input } from "../../shared/design-system/ui/Input";
import {
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
} from "../../shared/design-system/ui/Menu";
import { PreferenceRow } from "../../shared/design-system/ui/PreferenceRow";
import { Select } from "../../shared/design-system/ui/Select";
import { SettingsGroup } from "../../shared/design-system/ui/SettingsGroup";
import { Switch } from "../../shared/design-system/ui/Switch";
import { scopeOf } from "../reminders/react";
import { readTeamDocs, teamRelayUrl } from "../../team/relay/community";
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
import {
  encodeShared,
  readShared,
  SHARED_TAG,
  type SharedProfiles,
  sharedDTag,
} from "../../team/display/sharing";
import { displaySettings } from "../../team/display/store";
import "./dark.css";

export const inject = ["settingsCards", "pages", "relay"];

const useSettings = () =>
  useSyncExternalStore(displaySettings.subscribe, displaySettings.snapshot);

/** The community this window is in, for shared profiles. */
function communityOf(relay: RelayData) {
  const connection = relay.snapshot();
  const scope = connection.status === "ready" ? scopeOf(connection) : undefined;
  if (!scope || !connection.session) return undefined;
  return {
    session: connection.session,
    viewer: scope.viewer,
    dTag: sharedDTag(teamRelayUrl(scope.communityOrigin)),
  };
}

/** The community this window is in now; changes when the member switches. */
function useCommunity(relay: RelayData) {
  const connection = useSyncExternalStore(relay.subscribe, relay.snapshot);
  const scope = connection.status === "ready" ? scopeOf(connection) : undefined;
  return scope && connection.session
    ? {
        session: connection.session,
        viewer: scope.viewer,
        dTag: sharedDTag(teamRelayUrl(scope.communityOrigin)),
      }
    : undefined;
}
type Community = NonNullable<ReturnType<typeof useCommunity>>;

/** Runs an action and reports its message, or the error it threw. */
const report = (say: (message: string) => void, action: () => string) => {
  try {
    say(action());
  } catch (reason) {
    say(reason instanceof Error ? reason.message : String(reason));
  }
};

const applied = (name: string, skipped: readonly string[]) =>
  skipped.length
    ? `"${name}" 적용함. 이번 버전에서 적용 못 한 항목: ${skipped.join(", ")}`
    : `"${name}" 적용함.`;

/** Drag to change; the percentage shows beside the bar as it moves. The
 * screen follows the drag; saving waits until the bar is let go. */
function SliderRow({ name }: { name: SliderName }) {
  const settings = useSettings();
  const [dragging, setDragging] = useState<number>();
  const { label, min, max, step } = SLIDERS[name];
  const id = `ui-edit-${name}`;
  const value = dragging ?? settings[name];
  const commit = () => {
    if (dragging === undefined) return;
    setDragging(undefined);
    displaySettings.change({ ...displaySettings.snapshot(), [name]: dragging });
  };
  return (
    <PreferenceRow
      title={label}
      controlId={id}
      trailing={
        <span className="flex w-64 max-w-full items-center gap-3">
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            className="min-w-0 flex-1 accent-[var(--accent-9)]"
            onChange={(event) => {
              const next = Number(event.target.value);
              setDragging(next);
              displaySettings.preview({
                ...displaySettings.snapshot(),
                [name]: next,
              });
            }}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
          />
          <output htmlFor={id} className="w-11 text-right tabular-nums">
            {value}%
          </output>
        </span>
      }
    />
  );
}

function ChoiceRow<K extends "width" | "font">({
  name,
  label,
  options,
}: {
  name: K;
  label: string;
  options: readonly { id: DisplaySettings[K]; label: string }[];
}) {
  const settings = useSettings();
  return (
    <PreferenceRow
      title={label}
      trailing={
        <Select
          variant="compact"
          label={label}
          value={settings[name]}
          groups={[
            {
              label,
              options: options.map((option) => ({
                value: option.id,
                label: option.label,
              })),
            },
          ]}
          onValueChange={(value) =>
            displaySettings.change({
              ...displaySettings.snapshot(),
              [name]: value,
            })
          }
        />
      }
    />
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
        padding: "var(--space-3) var(--space-4)",
      }}
    >
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
              <div className="text-muted" data-no-translate="">
                {row.who}
              </div>
              <div>{row.text}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TopTabs({ pages }: { pages: PagesReader }) {
  const settings = useSettings();
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
  const move = (index: number, by: -1 | 1) => {
    const keys = tabs.map((page) => page.key);
    const [moved] = keys.splice(index, 1);
    if (moved === undefined) return;
    keys.splice(index + by, 0, moved);
    displaySettings.change({ ...settings, tabOrder: keys });
  };
  return (
    <SettingsGroup>
      {tabs.map((page, index) => {
        const label = pagePresentation(page).label;
        const shown = !settings.hiddenTabs.includes(page.key);
        return (
          <PreferenceRow
            key={page.key}
            title={label}
            trailing={
              <span className="flex items-center gap-1">
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={`${label} 앞으로`}
                  title="앞으로"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  icon={<span aria-hidden="true">↑</span>}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={`${label} 뒤로`}
                  title="뒤로"
                  disabled={index === tabs.length - 1}
                  onClick={() => move(index, 1)}
                  icon={<span aria-hidden="true">↓</span>}
                />
                <Switch
                  aria-label={`${label} 보이기`}
                  checked={shown}
                  onCheckedChange={(next) =>
                    displaySettings.change({
                      ...settings,
                      hiddenTabs: next
                        ? settings.hiddenTabs.filter((tab) => tab !== page.key)
                        : [...settings.hiddenTabs, page.key],
                    })
                  }
                />
              </span>
            }
          />
        );
      })}
    </SettingsGroup>
  );
}

function MyProfiles({
  tabsHere,
  community,
  say,
}: {
  tabsHere: readonly string[];
  community: string | undefined;
  say(message: string): void;
}) {
  const profiles = useSyncExternalStore(
    displaySettings.subscribe,
    displaySettings.profiles,
  );
  const last = useSyncExternalStore(
    displaySettings.subscribe,
    displaySettings.lastProfile,
  );
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ from: string; to: string }>();
  return (
    <SettingsGroup>
      <PreferenceRow
        title="지금 모습 저장"
        subtitle="글자·간격·색·탭·작업 영역 배치를 한 번에 저장해요"
        trailing={
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = name.trim();
              if (!trimmed) return;
              report(say, () => {
                displaySettings.saveProfile(trimmed);
                setName("");
                return `"${trimmed}"로 저장했어요.`;
              });
            }}
          >
            <Input
              aria-label="프로필 이름"
              placeholder="이름 (예: 업무용)"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" disabled={!name.trim()}>
              저장
            </Button>
          </form>
        }
      />
      {profiles.map((profile) => {
        const shared = !!community && !!profile.sharedIn?.includes(community);
        return renaming?.from === profile.name ? (
          <PreferenceRow
            key={profile.name}
            title="이름 바꾸기"
            trailing={
              <form
                className="flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  report(say, () => {
                    displaySettings.renameProfile(renaming.from, renaming.to);
                    setRenaming(undefined);
                    return `"${renaming.to.trim()}"로 바꿨어요.`;
                  });
                }}
              >
                <Input
                  aria-label="새 이름"
                  value={renaming.to}
                  maxLength={40}
                  onChange={(event) =>
                    setRenaming({ ...renaming, to: event.target.value })
                  }
                />
                <Button type="submit" disabled={!renaming.to.trim()}>
                  확인
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  onClick={() => setRenaming(undefined)}
                >
                  취소
                </Button>
              </form>
            }
          />
        ) : (
          <PreferenceRow
            key={profile.name}
            title={<span data-no-translate="">{profile.name}</span>}
            subtitle={
              [
                profile.name === last ? "마지막으로 적용" : "",
                shared ? "이 커뮤니티에 공유 중" : "",
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
            trailing={
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={profile.name === last ? "prominent" : "subtle"}
                  onClick={() =>
                    report(say, () =>
                      applied(
                        profile.name,
                        displaySettings.applyProfile(profile.name, tabsHere),
                      ),
                    )
                  }
                >
                  {profile.name === last ? "다시 적용" : "적용"}
                </Button>
                <MenuRoot>
                  <MenuTrigger
                    render={
                      <IconButton
                        size="sm"
                        variant="ghost"
                        aria-label={`${profile.name} 메뉴`}
                        icon={<DotsThreeIcon size={16} aria-hidden="true" />}
                      />
                    }
                  />
                  <MenuPopup align="end">
                    <MenuItem
                      onClick={() =>
                        report(say, () => {
                          displaySettings.updateProfile(profile.name);
                          return `"${profile.name}"를 지금 모습으로 바꿨어요.`;
                        })
                      }
                    >
                      지금 모습으로 덮어쓰기
                    </MenuItem>
                    <MenuItem
                      onClick={() =>
                        setRenaming({ from: profile.name, to: profile.name })
                      }
                    >
                      이름 바꾸기
                    </MenuItem>
                    <MenuItem
                      disabled={!community}
                      onClick={() =>
                        report(say, () => {
                          if (!community)
                            throw new Error(
                              "커뮤니티에 연결된 뒤 공유할 수 있어요.",
                            );
                          displaySettings.shareProfile(
                            profile.name,
                            community,
                            !shared,
                          );
                          return shared
                            ? `"${profile.name}" 공유를 멈췄어요.`
                            : `"${profile.name}"를 이 커뮤니티 팀원에게 공유했어요.`;
                        })
                      }
                    >
                      {shared ? "공유 그만하기" : "팀에 공유하기"}
                    </MenuItem>
                    <MenuItem
                      tone="danger"
                      onClick={() =>
                        report(say, () => {
                          displaySettings.deleteProfile(profile.name);
                          return `"${profile.name}"를 지웠어요.`;
                        })
                      }
                    >
                      삭제
                    </MenuItem>
                  </MenuPopup>
                </MenuRoot>
              </span>
            }
          />
        );
      })}
    </SettingsGroup>
  );
}

function TeamProfiles({
  community,
  tabsHere,
  say,
}: {
  community: Community | undefined;
  tabsHere: readonly string[];
  say(message: string): void;
}) {
  const [shared, setShared] = useState<readonly SharedProfiles[]>();
  const [revision, setRevision] = useState(0);
  const session = community?.session;
  const dTag = community?.dTag;
  const viewer = community?.viewer;
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision re-reads on request.
  useEffect(() => {
    if (!session || !dTag) {
      setShared([]);
      return;
    }
    let live = true;
    void readTeamDocs(session, dTag)
      .then((events) => {
        if (live)
          setShared(
            readShared(events).filter((entry) => entry.author !== viewer),
          );
      })
      .catch(() => {
        if (live) setShared([]);
      });
    return () => {
      live = false;
    };
  }, [session, dTag, viewer, revision]);
  const names = session?.profiles.snapshot();
  const who = (author: string) =>
    names?.get(author)?.name ?? author.slice(0, 8);
  const rows = (shared ?? []).flatMap((entry) =>
    entry.profiles.map((profile) => ({ author: entry.author, profile })),
  );
  return (
    <SettingsGroup>
      {shared === undefined ? (
        <PreferenceRow title="불러오는 중…" />
      ) : rows.length === 0 ? (
        <PreferenceRow
          title="아직 공유된 프로필이 없어요"
          subtitle="내 프로필의 ⋯ 메뉴에서 팀에 공유할 수 있어요"
        />
      ) : (
        // Names are unique per teammate (readShared drops repeats).
        rows.map(({ author, profile }) => (
          <PreferenceRow
            key={`${author}:${profile.name}`}
            title={<span data-no-translate="">{profile.name}</span>}
            subtitle={<span data-no-translate="">{who(author)}</span>}
            trailing={
              <span className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() =>
                    report(say, () =>
                      applied(
                        profile.name,
                        displaySettings.applyShared(profile, tabsHere),
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
                    report(
                      say,
                      () =>
                        `"${displaySettings.copyProfile(profile, who(author))}"로 내 프로필에 넣었어요.`,
                    )
                  }
                >
                  내 프로필로
                </Button>
              </span>
            }
          />
        ))
      )}
      <PreferenceRow
        title="다시 불러오기"
        trailing={
          <Button
            size="sm"
            variant="subtle"
            onClick={() => {
              setShared(undefined);
              setRevision((count) => count + 1);
            }}
          >
            새로고침
          </Button>
        }
      />
    </SettingsGroup>
  );
}

function UiEditCard({
  pages,
  relay,
}: {
  pages: PagesReader;
  relay: RelayData;
}) {
  const all = useSyncExternalStore(pages.subscribe, pages.snapshot);
  const tabsHere = all.map((page) => page.key);
  const community = useCommunity(relay);
  const [status, setStatus] = useState("");
  return (
    <div className="flex flex-col gap-6 text-sm">
      <Preview />
      {status && (
        <p role="status" className="text-muted">
          {status}
        </p>
      )}
      <section aria-label="모양">
        <InlineHeader
          title="모양"
          subtitle="화면 전체 크기는 Appearance의 Interface size나 ⌘+ / ⌘−로 바꿔요"
        />
        <SettingsGroup>
          <SliderRow name="text" />
          <SliderRow name="density" />
          <SliderRow name="avatar" />
          <SliderRow name="dark" />
          <ChoiceRow name="width" label="대화 폭" options={WIDTHS} />
          <ChoiceRow name="font" label="글꼴" options={FONTS} />
        </SettingsGroup>
      </section>
      <section aria-label="상단 탭">
        <InlineHeader
          title="상단 탭"
          subtitle="메시지 탭은 항상 맨 앞에 보여요"
        />
        <TopTabs pages={pages} />
      </section>
      <section aria-label="내 UI 프로필">
        <InlineHeader
          title="내 UI 프로필"
          subtitle="업데이트로 화면이 바뀌면 다시 적용으로 되돌려요"
        />
        <MyProfiles
          tabsHere={tabsHere}
          community={community?.dTag}
          say={setStatus}
        />
      </section>
      <section aria-label="팀 UI 프로필">
        <InlineHeader
          title="팀 UI 프로필"
          subtitle="팀원이 공유한 모습이에요"
        />
        <TeamProfiles
          key={community?.dTag ?? "none"}
          community={community}
          tabsHere={tabsHere}
          say={setStatus}
        />
      </section>
      <div>
        <Button
          variant="subtle"
          onClick={() => {
            displaySettings.change(DEFAULT_DISPLAY);
            setStatus("모두 원래대로 돌렸어요.");
          }}
        >
          모두 원래대로
        </Button>
      </div>
    </div>
  );
}

/** Publishes this member's shared profiles for the community the window is
 * in whenever they differ from what that community's relay holds. */
function publishShared(relay: RelayData) {
  // What each community's relay holds from this member, as published content.
  // Read once per community each run, so a share made offline or a failed
  // publish is sent the next time the app is open there.
  const onRelay = new Map<string, string | "reading">();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wanted = (dTag: string) => {
    try {
      return encodeShared(displaySettings.sharedProfiles(dTag));
    } catch {
      return undefined;
    }
  };
  const sync = () => {
    const community = communityOf(relay);
    if (!community) return;
    const known = onRelay.get(community.dTag);
    if (known === "reading") return;
    if (known === undefined) {
      onRelay.set(community.dTag, "reading");
      void readTeamDocs(community.session, community.dTag)
        .then((events) => {
          const own = events
            .filter((event) => event.pubkey === community.viewer)
            .sort((a, b) => b.created_at - a.created_at)[0];
          onRelay.set(community.dTag, own?.content ?? encodeShared([]));
        })
        // Unknown: compare with nothing shared, so a share still goes out.
        .catch(() => onRelay.set(community.dTag, encodeShared([])))
        .finally(sync);
      return;
    }
    const content = wanted(community.dTag);
    if (content === undefined || content === known) return;
    clearTimeout(timer);
    // Renames and shares settle before one publication.
    timer = setTimeout(() => {
      const now = communityOf(relay);
      const publish = now?.session.teamAppData?.publish;
      if (!now || now.dTag !== community.dTag || !publish) return;
      const latest = wanted(now.dTag);
      if (latest === undefined) return;
      void publish({
        kind: 30078,
        content: latest,
        tags: [
          ["d", now.dTag],
          ["t", SHARED_TAG],
        ],
        created_at: Math.floor(Date.now() / 1000),
      })
        .then(() => onRelay.set(now.dTag, latest))
        .catch(() => {});
    }, 800);
  };
  const stopSettings = displaySettings.subscribe(sync);
  const stopRelay = relay.subscribe(sync);
  sync();
  return () => {
    clearTimeout(timer);
    stopSettings();
    stopRelay();
  };
}

export const apply: PluginModule["apply"] = (ctx) => {
  ctx.effect(() => displaySettings.start());
  ctx.effect(() => publishShared(ctx.relay));
  ctx.settingsCards.register({
    id: "chat-display",
    title: "UI EDIT",
    component: () => <UiEditCard pages={ctx.pages} relay={ctx.relay} />,
  });
};
