import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { PluginModule } from "../../plugins/api";
import { Button } from "../../shared/design-system/ui/Button";
import {
  PRESETS,
  parseServers,
  scriptArgs,
  validateCommand,
  validateName,
  validateUrl,
  type AddSpec,
  type McpServer,
} from "../../team/mcp/servers";
import { scopeOf } from "../reminders/react";
import { McpPicker } from "./Picker";
import { makeRun, type Run } from "./run";

export const inject = [
  "settingsCards",
  "host",
  "conversation",
  "navigation",
  "relay",
];

const failureText = (code: number | null, stderr: string) =>
  code === 127
    ? "Claude가 설치돼 있지 않아요. 설정 → 플러그인에서 Claude를 먼저 설치하세요."
    : stderr.trim().split("\n").slice(-2).join(" ") ||
      "실패했어요. 다시 시도해 주세요.";

function McpSettings({ run }: { run: Run | undefined }) {
  const [servers, setServers] = useState<readonly McpServer[]>();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState("");
  const [custom, setCustom] = useState<"remote" | "command">("remote");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!run) return;
    const { code, stdout } = await run(["list"]);
    if (alive.current) setServers(code === 0 ? parseServers(stdout) : []);
  }, [run]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!run)
    return (
      <p className="text-sm text-muted" data-no-translate="">
        MCP 연결은 데스크톱 앱(Mac)에서만 쓸 수 있어요.
      </p>
    );

  const apply = async (key: string, args: readonly string[], done: string) => {
    setBusy(key);
    setMessage("");
    try {
      const { code, stderr } = await run(args);
      if (!alive.current) return;
      if (code === 0) {
        setMessage(done);
        await load();
      } else setMessage(failureText(code, stderr));
    } catch (reason) {
      if (alive.current)
        setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (alive.current) setBusy("");
    }
  };
  const connect = (key: string, spec: AddSpec, label: string) =>
    apply(
      key,
      scriptArgs(spec),
      `${label} 연결했어요. Buzz를 껐다 켜면 돌고 있는 에이전트도 써요.`,
    );
  const connected = new Set((servers ?? []).map((server) => server.name));

  const customProblem = (() => {
    if (!name && !value) return null;
    return (
      validateName(name) ??
      (custom === "remote" ? validateUrl(value) : validateCommand(value))
    );
  })();
  const addCustom = () => {
    const spec: AddSpec =
      custom === "remote"
        ? {
            kind: "remote",
            name,
            transport: /\/sse\b/.test(value) ? "sse" : "http",
            url: value,
          }
        : { kind: "command", name, commandLine: value };
    void connect("custom", spec, name).then(() => {
      setName("");
      setValue("");
    });
  };

  return (
    <div className="flex flex-col gap-6" data-no-translate="">
      <p className="text-sm text-muted">
        여기서 연결하면 이 맥의 Claude 에이전트가 바로 쓰고, 터미널의 Claude에도
        같이 적용돼요. 새로 켜는 에이전트부터 적용돼요.
      </p>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">연결된 것</h3>
        {servers === undefined ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : servers.length === 0 ? (
          <p className="text-sm text-muted">아직 연결한 게 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {servers.map((server) => (
              <li
                key={server.name}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{server.name}</p>
                  <p className="truncate text-xs text-muted">{server.target}</p>
                </div>
                {confirming === server.name ? (
                  <>
                    <Button
                      variant="destructive"
                      disabled={!!busy}
                      onClick={() => {
                        setConfirming("");
                        void apply(
                          `remove:${server.name}`,
                          ["remove", server.name],
                          `${server.name} 연결을 끊었어요.`,
                        );
                      }}
                    >
                      정말 끊기
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming("")}>
                      취소
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={!!busy}
                    onClick={() => setConfirming(server.name)}
                  >
                    끊기
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">추천</h3>
        <ul className="flex flex-col gap-1">
          {PRESETS.map((preset) => (
            <li
              key={preset.id}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{preset.label}</p>
                <p className="text-xs text-muted">{preset.description}</p>
                {preset.note && (
                  <p className="text-xs text-muted">⚠ {preset.note}</p>
                )}
              </div>
              <Button
                variant="subtle"
                disabled={!!busy || connected.has(preset.spec.name)}
                onClick={() =>
                  void connect(preset.id, preset.spec, preset.label)
                }
              >
                {connected.has(preset.spec.name)
                  ? "연결됨"
                  : busy === preset.id
                    ? "연결 중…"
                    : "연결"}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">직접 추가 (어도비 등)</h3>
        <p className="text-xs text-muted">
          도구 회사가 알려 준 MCP 주소를 넣거나, 오픈소스 도구를 실행하는 명령을
          넣으세요.
        </p>
        <fieldset className="flex gap-3 border-0 p-0 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={custom === "remote"}
              onChange={() => setCustom("remote")}
            />
            주소(https)
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={custom === "command"}
              onChange={() => setCustom("command")}
            />
            실행 명령
          </label>
        </fieldset>
        <input
          value={name}
          onChange={(event) => setName(event.currentTarget.value.trim())}
          placeholder="이름 (영어 소문자, 예: adobe)"
          className="h-8 rounded-md border border-input-line bg-surface px-2 text-sm"
        />
        <input
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          placeholder={
            custom === "remote" ? "https://…/mcp" : "npx -y 도구이름 (한 줄)"
          }
          className="h-8 rounded-md border border-input-line bg-surface px-2 text-sm"
        />
        {customProblem && (
          <p role="alert" className="text-xs text-muted">
            {customProblem}
          </p>
        )}
        {custom === "command" && (
          <p className="text-xs text-muted">
            ⚠ 이 명령은 Claude가 이 도구를 켤 때 내 맥에서 그대로 실행돼요. 믿을
            수 있는 것만 넣으세요.
          </p>
        )}
        <div>
          <Button
            variant="prominent"
            disabled={!!busy || !name || !value.trim() || !!customProblem}
            onClick={addCustom}
          >
            {busy === "custom" ? "연결 중…" : "추가"}
          </Button>
        </div>
      </section>

      {message && (
        <p role="status" className="text-xs text-muted">
          {message}
        </p>
      )}
    </div>
  );
}

export const apply: PluginModule["apply"] = (ctx) => {
  // Only the desktop app can start `bash`, and `plutil` is a Mac tool.
  const run =
    isTauri() && /Mac/i.test(navigator.platform)
      ? makeRun(ctx.host)
      : undefined;
  /** Settings → MCP connections, in the community the person is in. */
  const openSettings = () => {
    const connection = ctx.relay.snapshot();
    const scope =
      connection.status === "ready" ? scopeOf(connection) : undefined;
    void ctx.navigation.open({
      version: 1,
      kind: "settings",
      section: "buzz.team.mcp/mcp",
      scope: scope
        ? { viewer: scope.viewer, communityOrigin: scope.communityOrigin }
        : null,
    });
  };
  ctx.settingsCards.register({
    id: "mcp",
    title: "MCP connections",
    component: () => <McpSettings run={run} />,
  });
  if (run)
    ctx.conversation.registerTool({
      id: "mcp-tools",
      title: "MCP tools",
      component: (props) => (
        <McpPicker {...props} host={ctx.host} onManage={openSettings} />
      ),
    });
};
