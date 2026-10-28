import { useEffect, useMemo, useRef, useState } from "react";
import type { ComposerToolProps } from "../../features/conversation/contracts";
import type { Host } from "../../features/host/service";
import { WrenchIcon } from "../../shared/design-system/icons/index";
import { Button } from "../../shared/design-system/ui/Button";
import { IconButton } from "../../shared/design-system/ui/IconButton";
import {
  PopoverPopup,
  PopoverRoot,
  PopoverTrigger,
} from "../../shared/design-system/ui/Popover";
import type { McpClient, McpResult, McpTool } from "../../team/mcp/client";
import { buildArgs, schemaFields, type FieldValues } from "../../team/mcp/form";
import { launchLine, parseEntries } from "../../team/mcp/servers";
import { makeRun, startServer, type Run } from "./run";

/** The longest result put into the message box in one go. */
const MAX_INSERT = 3000;

type Entry = { name: string; line: string | null; target: string };

/** Everything a tool run printed as text. */
export function resultText(result: McpResult) {
  return result.content
    .filter((item) => item.type !== "image")
    .map((item) => ("text" in item ? item.text : ""))
    .join("\n\n")
    .trim();
}

function useServers(run: Run | undefined, active: boolean) {
  const [entries, setEntries] = useState<readonly Entry[]>();
  useEffect(() => {
    if (!active || !run) return;
    let live = true;
    void run(["list"]).then(({ code, stdout }) => {
      if (!live) return;
      const raw = code === 0 ? parseEntries(stdout) : {};
      setEntries(
        Object.entries(raw)
          .map(([name, entry]) => ({
            name,
            line: launchLine(entry),
            target:
              typeof entry.url === "string"
                ? entry.url
                : `${String(entry.command ?? "")} ${(Array.isArray(entry.args) ? entry.args : []).join(" ")}`.trim(),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
    return () => {
      live = false;
    };
  }, [run, active]);
  return entries;
}

type Session =
  | { status: "starting" }
  | { status: "ready"; client: McpClient; tools: readonly McpTool[] }
  | { status: "error"; message: string };

/** One running server while a person looks through its tools. */
function useSession(host: Host, entry: Entry | undefined): Session {
  const [session, setSession] = useState<Session>({ status: "starting" });
  useEffect(() => {
    if (!entry?.line) return;
    let live = true;
    let client: McpClient | undefined;
    setSession({ status: "starting" });
    void (async () => {
      try {
        client = await startServer(host, entry.line as string);
        await client.initialize();
        const tools = await client.listTools();
        if (live) setSession({ status: "ready", client, tools });
        else await client.close();
      } catch (reason) {
        await client?.close();
        if (live)
          setSession({
            status: "error",
            message: reason instanceof Error ? reason.message : String(reason),
          });
      }
    })();
    return () => {
      live = false;
      void client?.close();
    };
  }, [host, entry]);
  return session;
}

function ToolForm({
  client,
  tool,
  insertText,
  done,
}: {
  client: McpClient;
  tool: McpTool;
  insertText(text: string): boolean;
  done(): void;
}) {
  const fields = useMemo(() => schemaFields(tool.inputSchema), [tool]);
  const [values, setValues] = useState<FieldValues>({});
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "running" }
    | { status: "error"; message: string }
    | { status: "done"; result: McpResult }
  >({ status: "idle" });
  const set = (key: string, value: string | boolean) =>
    setValues((current) => ({ ...current, [key]: value }));
  const run = async () => {
    const built = buildArgs(fields, values);
    if ("error" in built) {
      setState({ status: "error", message: built.error });
      return;
    }
    setState({ status: "running" });
    try {
      setState({
        status: "done",
        result: await client.callTool(tool.name, built.args),
      });
    } catch (reason) {
      setState({
        status: "error",
        message: reason instanceof Error ? reason.message : String(reason),
      });
    }
  };
  const text = state.status === "done" ? resultText(state.result) : "";
  return (
    <div className="flex flex-col gap-2">
      {tool.description && (
        <p className="text-xs text-muted">{tool.description.slice(0, 400)}</p>
      )}
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1 text-xs">
          <span>
            {field.label}
            {field.required && " *"}
          </span>
          {field.kind === "boolean" ? (
            <input
              aria-label={field.key}
              type="checkbox"
              checked={values[field.key] === true}
              onChange={(event) => set(field.key, event.currentTarget.checked)}
            />
          ) : field.kind === "enum" ? (
            <select
              aria-label={field.key}
              value={String(values[field.key] ?? "")}
              onChange={(event) => set(field.key, event.currentTarget.value)}
              className="h-8 rounded-md border border-input-line bg-surface px-2 text-sm"
            >
              <option value="" />
              {field.options?.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          ) : field.multiline || field.kind === "json" ? (
            <textarea
              aria-label={field.key}
              rows={field.kind === "json" ? 3 : 4}
              value={String(values[field.key] ?? "")}
              onChange={(event) => set(field.key, event.currentTarget.value)}
              className="rounded-md border border-input-line bg-surface p-2 text-sm"
            />
          ) : (
            <input
              aria-label={field.key}
              value={String(values[field.key] ?? "")}
              inputMode={field.kind === "number" ? "decimal" : undefined}
              onChange={(event) => set(field.key, event.currentTarget.value)}
              className="h-8 rounded-md border border-input-line bg-surface px-2 text-sm"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          variant="prominent"
          disabled={state.status === "running"}
          onClick={() => void run()}
        >
          {state.status === "running" ? "실행 중…" : "실행"}
        </Button>
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-xs text-muted">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <div className="flex flex-col gap-2 border-t border-line pt-2">
          <p className="text-xs font-semibold">
            {state.result.isError ? "도구가 오류를 알려 줬어요" : "결과"}
          </p>
          {text && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-soft p-2 text-xs">
              {text}
            </pre>
          )}
          {state.result.content.map(
            (item, index) =>
              item.type === "image" && (
                <img
                  // biome-ignore lint/suspicious/noArrayIndexKey: results are shown once and never reordered.
                  key={index}
                  alt="도구가 만든 이미지"
                  src={`data:${item.mimeType};base64,${item.data}`}
                  className="max-h-48 rounded-md"
                />
              ),
          )}
          {!text && !state.result.content.length && (
            <p className="text-xs text-muted">결과가 비어 있어요.</p>
          )}
          {text.length > MAX_INSERT && (
            <p className="text-xs text-muted">
              길어서 앞쪽 {MAX_INSERT}자만 입력창에 넣어요.
            </p>
          )}
          <Button
            variant="subtle"
            disabled={!text}
            onClick={() => {
              if (insertText(text.slice(0, MAX_INSERT))) done();
            }}
          >
            입력창에 넣기
          </Button>
        </div>
      )}
    </div>
  );
}

function ServerView({
  host,
  entry,
  insertText,
  done,
}: {
  host: Host;
  entry: Entry;
  insertText(text: string): boolean;
  done(): void;
}) {
  const session = useSession(host, entry);
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState<McpTool>();
  if (session.status === "starting")
    return (
      <p className="text-xs text-muted">
        {entry.name}에 연결하는 중… 처음엔 내려받거나 브라우저 로그인 창이 뜰 수
        있어서 1~2분 걸려요.
      </p>
    );
  if (session.status === "error")
    return (
      <p role="alert" className="text-xs text-muted">
        연결하지 못했어요: {session.message}
      </p>
    );
  if (tool)
    return (
      <div className="flex flex-col gap-2">
        <Button variant="ghost" onClick={() => setTool(undefined)}>
          ← 도구 목록
        </Button>
        <h3 className="text-sm font-semibold">{tool.name}</h3>
        <ToolForm
          client={session.client}
          tool={tool}
          insertText={insertText}
          done={done}
        />
      </div>
    );
  const needle = query.trim().toLowerCase();
  const shown = session.tools.filter(
    (item) =>
      !needle ||
      item.name.toLowerCase().includes(needle) ||
      (item.description ?? "").toLowerCase().includes(needle),
  );
  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder={`도구 찾기 (${session.tools.length}개)`}
        className="h-8 rounded-md border border-input-line bg-surface px-2 text-sm"
      />
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {shown.map((item) => (
          <li key={item.name}>
            <button
              type="button"
              onClick={() => setTool(item)}
              className="w-full rounded-md px-2 py-1.5 text-left hover:bg-hover"
            >
              <p className="text-sm">{item.name}</p>
              {item.description && (
                <p className="line-clamp-2 text-xs text-muted">
                  {item.description}
                </p>
              )}
            </button>
          </li>
        ))}
        {!shown.length && (
          <li className="py-4 text-center text-xs text-muted">
            맞는 도구가 없어요.
          </li>
        )}
      </ul>
    </div>
  );
}

/** The composer button: pick a connected MCP server, one of its tools, run it. */
export function McpPicker({
  host,
  disabled,
  insertText,
}: Pick<ComposerToolProps, "disabled" | "insertText"> & { host: Host }) {
  const run = useMemo(() => makeRun(host), [host]);
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState<Entry>();
  const entries = useServers(run, open);
  const opened = useRef(open);
  useEffect(() => {
    // A new visit starts from the server list.
    if (open && !opened.current) setEntry(undefined);
    opened.current = open;
  }, [open]);
  return (
    <PopoverRoot open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <IconButton
            disabled={disabled}
            size="toolbar"
            type="button"
            aria-label="MCP 도구"
            title="MCP 도구 (노션·피그마·어도비 등)"
            icon={<WrenchIcon size={20} aria-hidden="true" />}
          />
        }
      />
      <PopoverPopup side="top" align="start" size="default">
        <div
          className="flex w-[360px] max-w-full flex-col gap-3"
          data-no-translate=""
        >
          <h2 className="text-sm font-semibold">MCP 도구</h2>
          {entry ? (
            <div className="flex flex-col gap-2">
              <Button variant="ghost" onClick={() => setEntry(undefined)}>
                ← 연결 목록
              </Button>
              <p className="text-xs font-semibold">{entry.name}</p>
              <ServerView
                // A different server starts a fresh session.
                key={entry.name}
                host={host}
                entry={entry}
                insertText={insertText}
                done={() => setOpen(false)}
              />
            </div>
          ) : entries === undefined ? (
            <p className="text-xs text-muted">불러오는 중…</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted">
              연결된 MCP가 없어요. 설정 → MCP 연결에서 먼저 연결해 주세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {entries.map((item) => (
                <li key={item.name}>
                  <button
                    type="button"
                    disabled={!item.line}
                    onClick={() => setEntry(item)}
                    className="w-full rounded-md px-2 py-1.5 text-left hover:bg-hover disabled:opacity-50"
                  >
                    <p className="text-sm">{item.name}</p>
                    <p className="truncate text-xs text-muted">{item.target}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverPopup>
    </PopoverRoot>
  );
}
