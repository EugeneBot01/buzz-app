import { expect, it } from "vitest";
import { buildArgs, schemaFields } from "./form";

const schema = {
  type: "object",
  properties: {
    text: { type: "string", description: "What to say" },
    count: { type: "integer" },
    loud: { type: "boolean" },
    mode: { enum: ["fast", "slow"] },
    extra: { type: "object" },
  },
  required: ["text"],
};

it("makes one field per property", () => {
  expect(schemaFields(schema).map((f) => [f.key, f.kind, f.required])).toEqual([
    ["text", "string", true],
    ["count", "number", false],
    ["loud", "boolean", false],
    ["mode", "enum", false],
    ["extra", "json", false],
  ]);
  expect(schemaFields(undefined)).toEqual([]);
  expect(schemaFields({ type: "object" })).toEqual([]);
});

it("builds arguments and leaves empty optional fields out", () => {
  const fields = schemaFields(schema);
  expect(
    buildArgs(fields, {
      text: " hi ",
      count: "3",
      loud: true,
      extra: '{"a":1}',
    }),
  ).toEqual({ args: { text: " hi ", count: 3, loud: true, extra: { a: 1 } } });
  expect(buildArgs(fields, { text: "x" })).toEqual({ args: { text: "x" } });
});

it("explains what to fix", () => {
  const fields = schemaFields(schema);
  expect(buildArgs(fields, {})).toEqual({
    error: '"text"을(를) 채워 주세요.',
  });
  expect(buildArgs(fields, { text: "x", count: "many" })).toMatchObject({
    error: expect.stringContaining("숫자"),
  });
  expect(buildArgs(fields, { text: "x", extra: "{bad" })).toMatchObject({
    error: expect.stringContaining("JSON"),
  });
});
