// A tiny MCP server for tests: newline-delimited JSON-RPC over stdio.
import readline from "node:readline";

const tools = [
  {
    name: "echo",
    description: "Repeat the text",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "What to say" } },
      required: ["text"],
    },
  },
  {
    name: "fail",
    description: "Always fails",
    inputSchema: { type: "object" },
  },
];
const reply = (id, result) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
const rl = readline.createInterface({ input: process.stdin });
process.stdout.write("starting up (not JSON)\n");
rl.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize")
    reply(message.id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "fake", version: "1" },
    });
  else if (message.method === "tools/list") {
    // Two pages, to exercise paging.
    if (message.params?.cursor) reply(message.id, { tools: [tools[1]] });
    else reply(message.id, { tools: [tools[0]], nextCursor: "2" });
  } else if (message.method === "tools/call") {
    const { name, arguments: args } = message.params;
    if (name === "echo")
      reply(message.id, {
        content: [{ type: "text", text: `You said: ${args.text}` }],
      });
    else
      reply(message.id, {
        isError: true,
        content: [{ type: "text", text: "nope" }],
      });
  } else if (message.id !== undefined)
    process.stdout.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "no" } })}\n`,
    );
});
rl.on("close", () => process.exit(0));
