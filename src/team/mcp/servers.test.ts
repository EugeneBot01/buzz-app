import { expect, it } from "vitest";
import {
  NAME_PATTERN,
  PRESETS,
  parseServers,
  scriptArgs,
  validateCommand,
  validateName,
  validateUrl,
} from "./servers";

it("allows https addresses and this computer's own apps only", () => {
  expect(validateUrl("https://mcp.notion.com/mcp")).toBeNull();
  expect(validateUrl("http://127.0.0.1:3845/mcp")).toBeNull();
  expect(validateUrl("http://localhost:3845/mcp")).toBeNull();
  expect(validateUrl("http://example.com/mcp")).not.toBeNull();
  expect(validateUrl("file:///etc/passwd")).not.toBeNull();
  expect(validateUrl("javascript:alert(1)")).not.toBeNull();
  expect(validateUrl("notion.so")).not.toBeNull();
});

it("accepts short lowercase names only", () => {
  expect(validateName("adobe-express")).toBeNull();
  expect(validateName("Adobe")).not.toBeNull();
  expect(validateName("-x")).not.toBeNull();
  expect(validateName("a b")).not.toBeNull();
  expect(validateName("a".repeat(41))).not.toBeNull();
});

it("accepts one-line commands", () => {
  expect(validateCommand("npx -y some-mcp --flag")).toBeNull();
  expect(validateCommand("   ")).not.toBeNull();
  expect(validateCommand("a\nb")).not.toBeNull();
  expect(validateCommand("x".repeat(601))).not.toBeNull();
});

it("builds script arguments without altering values", () => {
  expect(
    scriptArgs({
      kind: "remote",
      name: "notion",
      transport: "http",
      url: " https://mcp.notion.com/mcp ",
    }),
  ).toEqual(["add-remote", "notion", "http", "https://mcp.notion.com/mcp"]);
  expect(
    scriptArgs({ kind: "command", name: "x", commandLine: "npx -y a; b" }),
  ).toEqual(["add-command", "x", "npx -y a; b"]);
});

it("reads the servers Claude Code lists", () => {
  const list = parseServers(
    JSON.stringify({
      zeta: { type: "stdio", command: "npx", args: ["-y", "z-mcp"] },
      notion: { type: "http", url: "https://mcp.notion.com/mcp" },
      broken: 5,
    }),
  );
  expect(list).toEqual([
    { name: "notion", kind: "remote", target: "https://mcp.notion.com/mcp" },
    { name: "zeta", kind: "command", target: "npx -y z-mcp" },
  ]);
  expect(parseServers("not json")).toEqual([]);
  expect(parseServers("[]")).toEqual([]);
});

it("ships presets that obey their own rules", () => {
  const names = new Set<string>();
  for (const { spec } of PRESETS) {
    expect(NAME_PATTERN.test(spec.name)).toBe(true);
    expect(names.has(spec.name)).toBe(false);
    names.add(spec.name);
    if (spec.kind === "remote") expect(validateUrl(spec.url)).toBeNull();
    else expect(validateCommand(spec.commandLine)).toBeNull();
  }
});

import { launchLine, parseEntries, shellQuote } from "./servers";

it("quotes anything safely for sh", () => {
  expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  expect(shellQuote("a b; rm -rf /")).toBe("'a b; rm -rf /'");
});

it("starts a command server with its environment", () => {
  expect(
    launchLine({
      command: "npx",
      args: ["-y", "x-mcp"],
      env: { TOKEN: "a'b", "bad name": "no" },
    }),
  ).toBe(`export TOKEN='a'\\''b'; exec 'npx' '-y' 'x-mcp'`);
});

it("reaches a remote server through mcp-remote", () => {
  expect(launchLine({ type: "http", url: "https://mcp.notion.com/mcp" })).toBe(
    "exec 'npx' '-y' 'mcp-remote' 'https://mcp.notion.com/mcp'",
  );
  expect(
    launchLine({ type: "sse", url: "https://mcp.atlassian.com/v1/sse" }),
  ).toContain("'--transport' 'sse-only'");
  expect(launchLine({ url: "http://127.0.0.1:3845/mcp" })).toContain(
    "'--allow-http'",
  );
  expect(
    launchLine({
      url: "https://a.com/mcp",
      headers: { Authorization: "Bearer x" },
    }),
  ).toContain("'--header' 'Authorization:Bearer x'");
});

it("refuses what it cannot start safely", () => {
  expect(launchLine({ url: "http://evil.example.com/mcp" })).toBeNull();
  expect(launchLine({})).toBeNull();
  expect(parseEntries('{"a":{"command":"x"},"b":5}')).toEqual({
    a: { command: "x" },
  });
});
