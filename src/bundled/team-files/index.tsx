import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { PluginModule } from "../../plugins/api";
import type {
  ChannelLauncherProps,
  PanelProps,
} from "../../features/panels/service";
import type { RelayData } from "../../features/relay/service";
import type { RelaySession } from "../../features/relay/session";
import type { EventData } from "../../features/relay/events";
import { downloadNativeMedia } from "../../features/messages/native-download";
import { isNativeMediaSource } from "../../features/messages/attachment-source";
import { PaperclipIcon } from "../../shared/design-system/icons/index";
import { Button } from "../../shared/design-system/ui/Button";
import { IconButton } from "../../shared/design-system/ui/IconButton";
import { OpenFileButton } from "../../team/files/OpenButton";
import {
  collectFiles,
  fileName,
  filterFiles,
  formatSize,
  type ChannelFile,
  type FileKind,
} from "../../team/files/collect";

export const inject = ["panels", "relay"];

const PAGE = 200;
const KINDS: readonly { kind: FileKind; label: string }[] = [
  { kind: "all", label: "전체" },
  { kind: "image", label: "이미지" },
  { kind: "video", label: "영상" },
  { kind: "audio", label: "음성" },
  { kind: "file", label: "문서·파일" },
];
const noop = () => () => {};
const emptyProfiles = new Map();

/** Saves one file to Downloads; signed relay media goes through the host. */
async function save(session: RelaySession, file: ChannelFile) {
  const source = session.media(file.attachment.url);
  if (!source) throw new Error("이 파일은 받을 수 없어요");
  if (isNativeMediaSource(source))
    return downloadNativeMedia(source, file.attachment.name ?? "");
  const link = document.createElement("a");
  link.href = source;
  link.download = fileName(file);
  link.rel = "noopener";
  link.click();
}

function useSession(relay: RelayData) {
  return useSyncExternalStore(relay.subscribe, () => {
    const connection = relay.snapshot();
    return connection.status === "ready" ? connection.session : undefined;
  });
}

function FilesPanel({
  relay,
  channelId,
  close,
}: {
  relay: RelayData;
  channelId: string | undefined;
  close(): void;
}) {
  const session = useSession(relay);
  const [events, setEvents] = useState<readonly EventData[]>([]);
  const [state, setState] = useState<"loading" | "more" | "end" | "error">(
    "loading",
  );
  const [kind, setKind] = useState<FileKind>("all");
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState("");
  const profiles = useSyncExternalStore(
    session?.profiles.subscribe ?? noop,
    session ? session.profiles.snapshot : () => emptyProfiles,
  );

  const load = useCallback(
    async (until?: number) => {
      if (!session || !channelId) return;
      setState("loading");
      try {
        const page = (await session.read([
          {
            kinds: [9, 5],
            "#h": [channelId],
            limit: PAGE,
            ...(until ? { until } : {}),
          } as never,
        ])) as readonly EventData[];
        setEvents((current) => {
          const ids = new Set(current.map(({ id }) => id));
          return [...current, ...page.filter(({ id }) => !ids.has(id))];
        });
        setState(page.length < PAGE ? "end" : "more");
      } catch {
        setState("error");
      }
    },
    [session, channelId],
  );
  useEffect(() => {
    setEvents([]);
    void load();
  }, [load]);

  const files = useMemo(() => collectFiles(events), [events]);
  const shown = useMemo(
    () => filterFiles(files, kind, query),
    [files, kind, query],
  );
  useEffect(() => {
    if (!session) return;
    const authors = [...new Set(files.map(({ author }) => author))];
    if (authors.length) void session.profiles.ensure(authors).catch(() => {});
  }, [session, files]);

  const oldest = events.reduce(
    (min, event) => Math.min(min, event.created_at),
    Number.POSITIVE_INFINITY,
  );
  const downloadAll = async () => {
    if (!session) return;
    let done = 0;
    let failed = 0;
    for (const file of shown) {
      setProgress(`받는 중… ${done + failed + 1} / ${shown.length}`);
      try {
        await save(session, file);
        done++;
      } catch {
        failed++;
      }
    }
    setProgress(
      failed
        ? `${done}개를 다운로드 폴더에 받았고, ${failed}개는 받지 못했어요.`
        : `${done}개를 다운로드 폴더에 받았어요.`,
    );
  };

  if (!session || !channelId)
    return (
      <p className="p-4 text-sm text-muted" data-no-translate="">
        채널을 열면 파일 목록이 보여요.
      </p>
    );
  return (
    <section
      className="flex h-full min-h-0 flex-col gap-3 p-4 text-ink"
      aria-label="채널 파일"
      data-no-translate=""
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">채널 파일</h2>
        <Button variant="ghost" onClick={close}>
          닫기
        </Button>
      </header>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="파일 이름으로 찾기"
        className="h-8 rounded-md border border-input-line bg-surface px-2 text-sm"
      />
      <fieldset className="flex flex-wrap gap-1 border-0 p-0" aria-label="종류">
        {KINDS.map((entry) => (
          <Button
            key={entry.kind}
            variant={kind === entry.kind ? "prominent" : "subtle"}
            aria-pressed={kind === entry.kind}
            onClick={() => setKind(entry.kind)}
          >
            {entry.label}
          </Button>
        ))}
      </fieldset>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          {shown.length}개{state === "more" && " (더 오래된 파일이 있어요)"}
        </span>
        <Button
          variant="subtle"
          disabled={!shown.length || progress.startsWith("받는 중")}
          onClick={() => void downloadAll()}
        >
          모두 다운로드
        </Button>
      </div>
      {progress && <p className="text-xs text-muted">{progress}</p>}
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {shown.map((file) => (
          <FileRow
            key={file.attachment.url}
            file={file}
            author={profiles.get(file.author)?.name}
            source={session.media(file.attachment.url)}
            onSave={() => save(session, file)}
          />
        ))}
        {state !== "loading" && !shown.length && (
          <li className="py-6 text-center text-sm text-muted">
            {files.length
              ? "찾는 파일이 없어요."
              : "아직 올라온 파일이 없어요."}
          </li>
        )}
      </ul>
      {state === "loading" && (
        <p className="text-xs text-muted">불러오는 중…</p>
      )}
      {state === "error" && (
        <Button variant="subtle" onClick={() => void load()}>
          다시 불러오기
        </Button>
      )}
      {state === "more" && (
        <Button
          variant="subtle"
          onClick={() =>
            void load(Number.isFinite(oldest) ? oldest : undefined)
          }
        >
          더 오래된 파일 불러오기
        </Button>
      )}
    </section>
  );
}

function FileRow({
  file,
  author,
  source,
  onSave,
}: {
  file: ChannelFile;
  author: string | undefined;
  source: string | undefined;
  onSave(): Promise<void>;
}) {
  const [status, setStatus] = useState("");
  const date = new Date(file.at * 1000).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={fileName(file)}>
          {fileName(file)}
        </p>
        <p className="truncate text-xs text-muted">
          {[formatSize(file.attachment.size), author, date]
            .filter(Boolean)
            .join(" · ")}
          {status && ` · ${status}`}
        </p>
      </div>
      <Button
        variant="ghost"
        onClick={() => {
          setStatus("받는 중…");
          onSave().then(
            () => setStatus("받음"),
            () => setStatus("실패"),
          );
        }}
      >
        다운로드
      </Button>
      <OpenFileButton source={source} name={file.attachment.name} />
    </li>
  );
}

export const apply: PluginModule["apply"] = (ctx) => {
  function Launcher({ context, toggle, pressed }: ChannelLauncherProps) {
    const target = `buzz-team-files:${context.channelId}`;
    return (
      <IconButton
        size="toolbar"
        icon={<PaperclipIcon size={16} aria-hidden="true" />}
        aria-label="Channel files"
        title="Channel files"
        aria-expanded={pressed}
        onClick={(event) => {
          event.currentTarget.focus();
          toggle(target);
        }}
      />
    );
  }
  ctx.panels.register({
    id: "files",
    title: "Channel files",
    matches: (url) => url.startsWith("buzz-team-files:"),
    channelLauncher: Launcher,
    channelPlacement: "side",
    component: (props: PanelProps) => (
      <FilesPanel
        relay={ctx.relay}
        channelId={
          props.channelContext?.channelId ??
          props.context?.channelId ??
          props.target.slice("buzz-team-files:".length)
        }
        close={props.close}
      />
    ),
  });
};
