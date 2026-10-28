/**
 * A small MCP client over stdio (Buzz Team): newline-delimited JSON-RPC.
 * It lists a server's tools and runs one when a person asks. The process is
 * started by the plugin; this class only speaks the protocol.
 */
export type McpTool = Readonly<{
  name: string;
  description?: string | undefined;
  inputSchema?: unknown;
}>;
export type McpContent = Readonly<
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "other"; text: string }
>;
export type McpResult = Readonly<{ isError: boolean; content: McpContent[] }>;

const PROTOCOL_VERSION = "2025-03-26";
/** A first start may download the server or wait for a browser sign-in. */
export const START_TIMEOUT_MS = 180_000;
export const CALL_TIMEOUT_MS = 120_000;
const MAX_LINE = 8 * 1024 * 1024;
const MAX_STDERR = 2000;

type Pending = {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

export class McpClient {
  private write: ((line: string) => Promise<void>) | undefined;
  private kill: (() => Promise<void>) | undefined;
  private buffer = "";
  private next = 1;
  private readonly pending = new Map<number, Pending>();
  private stderr = "";
  private closed = false;

  /** Connects the process: how to write a line to it and how to stop it. */
  attach(write: (line: string) => Promise<void>, kill: () => Promise<void>) {
    this.write = write;
    this.kill = kill;
  }

  /** Bytes the server printed. */
  feed(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length > MAX_LINE && !this.buffer.includes("\n")) {
      this.fail(new Error("MCP 서버가 너무 큰 응답을 한 줄로 보냈어요."));
      return;
    }
    let at = this.buffer.indexOf("\n");
    while (at >= 0) {
      const line = this.buffer.slice(0, at).trim();
      this.buffer = this.buffer.slice(at + 1);
      if (line) this.handle(line);
      at = this.buffer.indexOf("\n");
    }
  }

  /** What the server printed to its error stream (the last part). */
  feedError(chunk: string) {
    this.stderr = (this.stderr + chunk).slice(-MAX_STDERR);
  }

  /** The process ended; every waiting request fails. */
  ended(reason?: string) {
    this.closed = true;
    const detail = this.stderr.trim().split("\n").slice(-3).join(" ");
    this.fail(
      new Error(
        reason ??
          (detail ? `MCP 서버가 멈췄어요: ${detail}` : "MCP 서버가 멈췄어요."),
      ),
    );
  }

  private fail(error: Error) {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }

  private handle(line: string) {
    let message: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== "object") return;
      message = parsed as Record<string, unknown>;
    } catch {
      return; // A server may print log lines; only JSON objects count.
    }
    const id = message.id;
    if (typeof message.method === "string") {
      // Requests from the server: Buzz answers pings and declines the rest.
      if (id !== undefined && id !== null)
        void this.send(
          message.method === "ping"
            ? { jsonrpc: "2.0", id, result: {} }
            : {
                jsonrpc: "2.0",
                id,
                error: { code: -32601, message: "Method not found" },
              },
        );
      return;
    }
    if (typeof id !== "number") return;
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    const error = message.error as { message?: unknown } | undefined;
    if (error)
      entry.reject(
        new Error(
          typeof error.message === "string" ? error.message : "MCP 오류",
        ),
      );
    else entry.resolve(message.result);
  }

  private async send(message: unknown) {
    if (!this.write || this.closed) throw new Error("MCP 서버가 닫혀 있어요.");
    await this.write(`${JSON.stringify(message)}\n`);
  }

  private request(method: string, params: unknown, timeoutMs: number) {
    return new Promise<unknown>((resolve, reject) => {
      const id = this.next++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("MCP 서버가 시간 안에 답하지 않았어요."));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params }).catch((error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  async initialize() {
    await this.request(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "buzz-team", version: "1" },
      },
      START_TIMEOUT_MS,
    );
    await this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = (await this.request(
        "tools/list",
        cursor ? { cursor } : {},
        CALL_TIMEOUT_MS,
      )) as { tools?: unknown; nextCursor?: unknown } | undefined;
      for (const raw of Array.isArray(result?.tools) ? result.tools : []) {
        if (!raw || typeof raw !== "object") continue;
        const tool = raw as Record<string, unknown>;
        if (typeof tool.name !== "string") continue;
        tools.push({
          name: tool.name,
          description:
            typeof tool.description === "string" ? tool.description : undefined,
          inputSchema: tool.inputSchema,
        });
      }
      cursor =
        typeof result?.nextCursor === "string" ? result.nextCursor : undefined;
      if (!cursor) break;
    }
    return tools.sort((a, b) => a.name.localeCompare(b.name));
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const result = (await this.request(
      "tools/call",
      { name, arguments: args },
      CALL_TIMEOUT_MS,
    )) as { content?: unknown; isError?: unknown } | undefined;
    const content: McpContent[] = [];
    for (const raw of Array.isArray(result?.content) ? result.content : []) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      if (item.type === "text" && typeof item.text === "string")
        content.push({ type: "text", text: item.text });
      else if (
        item.type === "image" &&
        typeof item.data === "string" &&
        typeof item.mimeType === "string" &&
        /^image\/(png|jpeg|gif|webp)$/.test(item.mimeType)
      )
        content.push({
          type: "image",
          data: item.data,
          mimeType: item.mimeType,
        });
      else
        content.push({
          type: "other",
          text: JSON.stringify(item).slice(0, 4000),
        });
    }
    return { isError: result?.isError === true, content } satisfies McpResult;
  }

  async close() {
    this.closed = true;
    this.fail(new Error("닫았어요."));
    await this.kill?.().catch(() => undefined);
  }
}
