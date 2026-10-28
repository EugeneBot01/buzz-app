import { spawn } from "node:child_process";
import { join } from "node:path";
import { expect, it } from "vitest";
import { McpClient } from "./client";

/** The client against a real child process speaking MCP. */
function start() {
  const child = spawn(
    process.execPath,
    [join(__dirname, "testing/fake-server.mjs")],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  const client = new McpClient();
  child.stdout.setEncoding("utf8").on("data", (data) => client.feed(data));
  child.stderr.setEncoding("utf8").on("data", (data) => client.feedError(data));
  child.on("exit", () => client.ended());
  client.attach(
    async (line) => void child.stdin.write(line),
    async () => void child.kill(),
  );
  return { client, child };
}

it("starts, lists tools across pages and runs one", async () => {
  const { client } = start();
  try {
    await client.initialize();
    const tools = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["echo", "fail"]);
    expect(tools[0]?.description).toBe("Repeat the text");
    const result = await client.callTool("echo", { text: "안녕" });
    expect(result).toEqual({
      isError: false,
      content: [{ type: "text", text: "You said: 안녕" }],
    });
    const failed = await client.callTool("fail", {});
    expect(failed.isError).toBe(true);
  } finally {
    await client.close();
  }
});

it("fails waiting requests when the server stops", async () => {
  const { client, child } = start();
  await client.initialize();
  const waiting = client.listTools();
  child.kill();
  await expect(waiting).rejects.toThrow(/멈췄어요|닫/);
});

it("handles output split across chunks and ignores log lines", () => {
  const client = new McpClient();
  const sent: string[] = [];
  client.attach(
    async (line) => void sent.push(line),
    async () => {},
  );
  // A ping from the server arrives in two pieces after a log line.
  client.feed('Server ready\n{"jsonrpc":"2.0","id":7,');
  client.feed('"method":"ping"}\n');
  return new Promise<void>((resolve) =>
    setTimeout(() => {
      expect(sent.map((line) => JSON.parse(line))).toEqual([
        { jsonrpc: "2.0", id: 7, result: {} },
      ]);
      resolve();
    }, 10),
  );
});
