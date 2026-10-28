import type { Host } from "../../features/host/service";
import { McpClient } from "../../team/mcp/client";
import script from "./mcp.sh?raw";

const TIMEOUT_MS = 90_000;

export type Run = (args: readonly string[]) => Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}>;

/** Runs one `mcp.sh` step and collects what it prints. */
export function makeRun(host: Host): Run | undefined {
  const spawn = host.spawn?.bind(host);
  if (!spawn) return undefined;
  return async (args) => {
    let stdout = "";
    let stderr = "";
    const child = await spawn("mcp-sh", {
      args: [script, "mcp.sh", ...args],
      onStdout: (data) => {
        stdout += data;
      },
      onStderr: (data) => {
        stderr += data;
      },
    });
    const timer = setTimeout(() => void child.kill(), TIMEOUT_MS);
    const code = await child.exited;
    clearTimeout(timer);
    return { code, stdout, stderr };
  };
}

/** Starts an MCP server from its shell line and connects a client to it. */
export async function startServer(host: Host, line: string) {
  const spawn = host.spawn?.bind(host);
  if (!spawn) throw new Error("이 앱에서는 MCP 도구를 실행할 수 없어요.");
  const client = new McpClient();
  const child = await spawn("mcp-sh", {
    args: [script, "mcp.sh", "serve", line],
    onStdout: (data) => client.feed(data),
    onStderr: (data) => client.feedError(data),
  });
  client.attach(
    (data) => child.write(data),
    () => child.kill(),
  );
  void child.exited.then(() => client.ended());
  return client;
}
