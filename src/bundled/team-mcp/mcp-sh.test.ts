// The real mcp.sh in a throwaway home with a fake `claude` that records its
// arguments, so what Buzz would register is checked without touching a real one.
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import script from "./mcp.sh?raw";

const run = promisify(execFile);
const homes: string[] = [];
afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

async function home(withClaude = true) {
  const dir = await mkdtemp(join(tmpdir(), "buzz-mcp-"));
  homes.push(dir);
  const log = join(dir, "calls.log");
  if (withClaude) {
    const bin = join(dir, ".local/bin");
    await mkdir(bin, { recursive: true });
    // One line per call, arguments separated by "|".
    await writeFile(
      join(bin, "claude"),
      `#!/bin/sh\nprintf '%s\\n' "$(IFS='|'; echo "$*")" >> "${log}"\n`,
    );
    await chmod(join(bin, "claude"), 0o755);
  }
  return { dir, log };
}
const bash = (dir: string, ...args: string[]) =>
  run("bash", ["-c", script, "mcp.sh", ...args], {
    // A PATH without Homebrew or a real claude: only HOME's fake one can match.
    env: { HOME: dir, PATH: "/usr/bin:/bin" },
  });
const failure = async (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: { code?: number; stderr?: string }) => error,
  );

it("registers a remote server for the user, replacing an older copy", async () => {
  const { dir, log } = await home();
  await bash(dir, "add-remote", "notion", "http", "https://mcp.notion.com/mcp");
  expect((await readFile(log, "utf8")).trim().split("\n")).toEqual([
    "mcp|remove|-s|user|notion",
    "mcp|add|--transport|http|-s|user|notion|https://mcp.notion.com/mcp",
  ]);
});

it("passes a command line as one argument to sh -c", async () => {
  const { dir, log } = await home();
  const line = 'npx -y x; echo "$HOME" | cat';
  await bash(dir, "add-command", "tool", line);
  const calls = (await readFile(log, "utf8")).trim().split("\n");
  expect(calls[1]).toBe(`mcp|add|-s|user|tool|--|/bin/sh|-c|${line}`);
});

it("disconnects a server", async () => {
  const { dir, log } = await home();
  await bash(dir, "remove", "notion");
  expect((await readFile(log, "utf8")).trim()).toBe(
    "mcp|remove|-s|user|notion",
  );
});

it("refuses bad names, addresses and transports before running anything", async () => {
  const { dir, log } = await home();
  for (const args of [
    ["add-remote", "Bad Name", "http", "https://a.com/x"],
    ["add-remote", "ok", "http", "http://evil.example.com/x"],
    ["add-remote", "ok", "http", "file:///etc/passwd"],
    ["add-remote", "ok", "ws", "https://a.com/x"],
    ["add-command", "ok", ""],
    ["remove", "--help"],
    ["nothing"],
  ]) {
    const error = await failure(bash(dir, ...args));
    expect(error?.code, args.join(" ")).toBe(2);
  }
  await expect(readFile(log, "utf8")).rejects.toThrow();
});

it("says so when Claude is not installed", async () => {
  const { dir } = await home(false);
  const error = await failure(bash(dir, "remove", "notion"));
  expect(error?.code).toBe(127);
});

it.skipIf(process.platform !== "darwin")(
  "lists the servers in the user's Claude config",
  async () => {
    const { dir } = await home(false);
    expect((await bash(dir, "list")).stdout.trim()).toBe("{}");
    await writeFile(
      join(dir, ".claude.json"),
      JSON.stringify({
        numStartups: 3,
        mcpServers: {
          notion: { type: "http", url: "https://mcp.notion.com/mcp" },
        },
      }),
    );
    expect(JSON.parse((await bash(dir, "list")).stdout)).toEqual({
      notion: { type: "http", url: "https://mcp.notion.com/mcp" },
    });
    await writeFile(
      join(dir, ".claude.json"),
      JSON.stringify({ numStartups: 3 }),
    );
    expect((await bash(dir, "list")).stdout.trim()).toBe("{}");
  },
);
