import { useEffect, useState, useSyncExternalStore } from "react";
import type { PluginModule } from "../../plugins/api";
import type {
  ChannelLauncherProps,
  PanelProps,
} from "../../features/panels/service";
import type { RelayData } from "../../features/relay/service";
import type { RelaySession } from "../../features/relay/session";
import { LinkIcon } from "../../shared/design-system/icons/index";
import { Button } from "../../shared/design-system/ui/Button";
import { IconButton } from "../../shared/design-system/ui/IconButton";
import { scopeOf } from "../reminders/react";
import { readTeamDocs, teamRelayUrl } from "../../team/relay/community";
import {
  MAX_SHORTCUTS,
  SHORTCUTS_TAG,
  encodeShortcuts,
  latestShortcuts,
  safeShortcutUrl,
  shortcutTitle,
  shortcutsDTag,
  type Shortcut,
} from "../../team/shortcuts/links";

export const inject = ["panels", "relay"];

const TARGET = "buzz-team-shortcuts:";

// ---- one shared cache per channel, so the header row and the editor agree ----

type Entry = { links: readonly Shortcut[]; loaded: boolean };
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
const empty: Entry = { links: [], loaded: false };
const emit = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

type Scope = { session: RelaySession; dTag: string; channelId: string };

function scopeFor(relay: RelayData, channelId: string): Scope | undefined {
  const connection = relay.snapshot();
  const scope = connection.status === "ready" ? scopeOf(connection) : undefined;
  if (!scope || !connection.session) return undefined;
  return {
    session: connection.session,
    channelId,
    dTag: shortcutsDTag(teamRelayUrl(scope.communityOrigin), channelId),
  };
}

async function load(scope: Scope) {
  const { session, channelId, dTag } = scope;
  const members = new Set(
    session.channels.list().channels.find(({ id }) => id === channelId)
      ?.members ?? [],
  );
  if (session.viewer) members.add(session.viewer);
  const events = await readTeamDocs(session, dTag);
  cache.set(dTag, {
    links: latestShortcuts(events, members)?.links ?? [],
    loaded: true,
  });
  emit();
}

async function save(scope: Scope, links: readonly Shortcut[]) {
  const publish = scope.session.teamAppData?.publish;
  if (!publish) throw new Error("이 연결에서는 저장할 수 없어요");
  await publish({
    kind: 30078,
    content: encodeShortcuts(links),
    tags: [
      ["d", scope.dTag],
      ["t", SHORTCUTS_TAG],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });
  cache.set(scope.dTag, { links, loaded: true });
  emit();
}

function useShortcuts(relay: RelayData, channelId: string) {
  const connection = useSyncExternalStore(relay.subscribe, relay.snapshot);
  const scope = connection ? scopeFor(relay, channelId) : undefined;
  const dTag = scope?.dTag;
  const entry = useSyncExternalStore(subscribe, () =>
    dTag ? (cache.get(dTag) ?? empty) : empty,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: dTag changes when the community connects or switches, which must load again.
  useEffect(() => {
    const current = scopeFor(relay, channelId);
    if (current && !cache.get(current.dTag)?.loaded)
      void load(current).catch(() => {});
  }, [relay, channelId, dTag]);
  return { scope, entry };
}

// ---- header row: the links themselves, plus a button to edit them ----

function makeLauncher(relay: RelayData) {
  return function ShortcutsLauncher({
    context,
    toggle,
    pressed,
  }: ChannelLauncherProps) {
    const { entry } = useShortcuts(relay, context.channelId);
    return (
      <span className="flex items-center gap-1" data-no-translate="">
        {entry.links.slice(0, 5).map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            title={link.url}
            className="max-w-28 truncate rounded-md border border-line px-2 py-0.5 text-xs text-ink hover:bg-hover"
          >
            {link.title}
          </a>
        ))}
        <IconButton
          size="toolbar"
          icon={<LinkIcon size={16} aria-hidden="true" />}
          aria-label="채널 바로가기 편집"
          title={
            entry.links.length > 5
              ? `바로가기 ${entry.links.length}개 · 편집`
              : "채널 바로가기 편집"
          }
          aria-expanded={pressed}
          onClick={(event) => {
            event.currentTarget.focus();
            toggle(`${TARGET}${context.channelId}`);
          }}
        />
      </span>
    );
  };
}

// ---- side panel: add, remove and save ----

function ShortcutsPanel({
  relay,
  channelId,
  close,
}: {
  relay: RelayData;
  channelId: string;
  close(): void;
}) {
  const { scope, entry } = useShortcuts(relay, channelId);
  const [draft, setDraft] = useState<readonly Shortcut[]>();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (entry.loaded) setDraft(entry.links);
  }, [entry]);
  const links = draft ?? entry.links;
  const dirty = draft !== undefined && draft !== entry.links;
  const add = () => {
    const safe = safeShortcutUrl(url);
    if (!safe) {
      setStatus("https로 시작하는 주소를 넣어 주세요.");
      return;
    }
    if (links.length >= MAX_SHORTCUTS) {
      setStatus(`바로가기는 ${MAX_SHORTCUTS}개까지예요.`);
      return;
    }
    setDraft([
      ...links,
      { title: title.trim() || shortcutTitle(safe), url: safe },
    ]);
    setUrl("");
    setTitle("");
    setStatus("");
  };
  return (
    <section
      className="flex h-full min-h-0 flex-col gap-3 p-4 text-ink"
      aria-label="채널 바로가기"
      data-no-translate=""
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">채널 바로가기</h2>
        <Button variant="ghost" onClick={close}>
          닫기
        </Button>
      </header>
      <p className="text-xs text-muted">
        채널 위쪽에 보이는 링크예요. 이 채널 사람 모두가 같이 봐요.
      </p>
      {!entry.loaded ? (
        <p className="text-sm text-muted">불러오는 중…</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {links.map((link, index) => (
            <li
              key={link.url}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{link.title}</p>
                <p className="truncate text-xs text-muted">{link.url}</p>
              </div>
              <Button
                variant="ghost"
                onClick={() =>
                  setDraft(links.filter((_, other) => other !== index))
                }
              >
                빼기
              </Button>
            </li>
          ))}
          {!links.length && (
            <li className="py-6 text-center text-sm text-muted">
              아직 바로가기가 없어요.
            </li>
          )}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 border-t border-line pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          value={url}
          onChange={(event) => setUrl(event.currentTarget.value)}
          placeholder="주소 (예: https://notion.so/…)"
          className="h-8 rounded-md border border-input-line bg-surface px-2 text-sm"
        />
        <input
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          placeholder="이름 (비우면 사이트 이름)"
          maxLength={60}
          className="h-8 rounded-md border border-input-line bg-surface px-2 text-sm"
        />
        <Button type="submit" variant="subtle" disabled={!url.trim()}>
          추가
        </Button>
      </form>
      <div className="flex items-center gap-3">
        <Button
          variant="prominent"
          disabled={!dirty || !scope?.session.teamAppData}
          onClick={() => {
            if (!scope || !draft) return;
            setStatus("저장 중…");
            save(scope, draft).then(
              () => setStatus("저장했어요."),
              (reason: unknown) =>
                setStatus(
                  `저장하지 못했어요: ${reason instanceof Error ? reason.message : String(reason)}`,
                ),
            );
          }}
        >
          저장
        </Button>
        {status && <span className="text-xs text-muted">{status}</span>}
      </div>
    </section>
  );
}

export const apply: PluginModule["apply"] = (ctx) => {
  ctx.panels.register({
    id: "shortcuts",
    title: "Channel shortcuts",
    matches: (url) => url.startsWith(TARGET),
    channelLauncher: makeLauncher(ctx.relay),
    channelPlacement: "side",
    component: (props: PanelProps) => (
      <ShortcutsPanel
        relay={ctx.relay}
        channelId={
          props.channelContext?.channelId ??
          props.context?.channelId ??
          props.target.slice(TARGET.length)
        }
        close={props.close}
      />
    ),
  });
};
