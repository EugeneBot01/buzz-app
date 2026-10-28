// @vitest-environment jsdom
import { spawn } from "node:child_process";
import { join } from "node:path";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Host } from "../../features/host/service";
import { McpPicker } from "./Picker";

afterEach(cleanup);

const server = join(process.cwd(), "src/team/mcp/testing/fake-server.mjs");

/** `mcp.sh list` reports one server; `mcp.sh serve` runs the real fake one. */
function fakeHost() {
  return {
    spawn: async (
      _id: string,
      options: {
        args?: readonly string[];
        onStdout?(data: string): void;
        onStderr?(data: string): void;
      },
    ) => {
      const step = options.args?.[2];
      if (step === "list") {
        options.onStdout?.(
          JSON.stringify({
            fake: { type: "stdio", command: process.execPath, args: [server] },
          }),
        );
        return {
          exited: Promise.resolve(0),
          kill: async () => {},
          write: async () => {},
          end: async () => {},
        };
      }
      const child = spawn("/bin/sh", ["-c", String(options.args?.[3])], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stdout.setEncoding("utf8").on("data", (d) => options.onStdout?.(d));
      child.stderr.setEncoding("utf8").on("data", (d) => options.onStderr?.(d));
      return {
        exited: new Promise<number | null>((resolve) =>
          child.on("exit", resolve),
        ),
        kill: async () => void child.kill(),
        write: async (data: string) => void child.stdin.write(data),
        end: async () => void child.stdin.end(),
      };
    },
  } as unknown as Host;
}

it("lists a connected server, its tools, runs one and offers the result", async () => {
  const insertText = vi.fn(() => true);
  render(
    <McpPicker host={fakeHost()} disabled={false} insertText={insertText} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "MCP 도구" }));
  fireEvent.click(await screen.findByRole("button", { name: /^fake/ }));
  fireEvent.click(
    await screen.findByRole("button", { name: /^echo/ }, { timeout: 15000 }),
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "안녕" } });
  fireEvent.click(screen.getByRole("button", { name: "실행" }));
  expect(
    await screen.findByText("You said: 안녕", {}, { timeout: 10000 }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "입력창에 넣기" }));
  expect(insertText).toHaveBeenCalledWith("You said: 안녕");
}, 40000);

it("asks to connect something first when nothing is connected", async () => {
  const host = {
    spawn: async (_id: string, options: { onStdout?(data: string): void }) => {
      options.onStdout?.("{}");
      return {
        exited: Promise.resolve(0),
        kill: async () => {},
        write: async () => {},
        end: async () => {},
      };
    },
  } as unknown as Host;
  render(<McpPicker host={host} disabled={false} insertText={() => true} />);
  fireEvent.click(screen.getByRole("button", { name: "MCP 도구" }));
  expect(await screen.findByText(/연결된 MCP가 없어요/)).toBeInTheDocument();
});
