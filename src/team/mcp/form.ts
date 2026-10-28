/** Turns a tool's JSON Schema into input fields, and the fields into arguments. */
export type Field = Readonly<{
  key: string;
  label: string;
  required: boolean;
  kind: "string" | "number" | "boolean" | "enum" | "json";
  options?: readonly string[];
  multiline?: boolean;
}>;

const MAX_FIELDS = 40;

export function schemaFields(schema: unknown): Field[] {
  if (!schema || typeof schema !== "object") return [];
  const { properties, required } = schema as {
    properties?: unknown;
    required?: unknown;
  };
  if (!properties || typeof properties !== "object") return [];
  const needed = new Set(
    Array.isArray(required)
      ? required.filter((key): key is string => typeof key === "string")
      : [],
  );
  const fields: Field[] = [];
  for (const [key, raw] of Object.entries(properties).slice(0, MAX_FIELDS)) {
    const prop = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    const description =
      typeof prop.description === "string" ? prop.description : "";
    const label = description ? `${key} — ${description.slice(0, 120)}` : key;
    const base = { key, label, required: needed.has(key) };
    const options = Array.isArray(prop.enum)
      ? prop.enum.filter((item): item is string => typeof item === "string")
      : [];
    if (options.length) fields.push({ ...base, kind: "enum", options });
    else if (prop.type === "string")
      fields.push({
        ...base,
        kind: "string",
        multiline: /text|content|body|prompt|description|message/i.test(key),
      });
    else if (prop.type === "number" || prop.type === "integer")
      fields.push({ ...base, kind: "number" });
    else if (prop.type === "boolean") fields.push({ ...base, kind: "boolean" });
    else fields.push({ ...base, kind: "json" });
  }
  return fields;
}

export type FieldValues = Readonly<Record<string, string | boolean>>;

/** The arguments to send, or what to fix. Empty optional fields are left out. */
export function buildArgs(
  fields: readonly Field[],
  values: FieldValues,
): { args: Record<string, unknown> } | { error: string } {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (field.kind === "boolean") {
      if (value === true || value === false) args[field.key] = value;
      else if (field.required) args[field.key] = false;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      if (field.required) return { error: `"${field.key}"을(를) 채워 주세요.` };
      continue;
    }
    if (field.kind === "number") {
      const number = Number(text);
      if (!Number.isFinite(number))
        return { error: `"${field.key}"에는 숫자를 넣어 주세요.` };
      args[field.key] = number;
    } else if (field.kind === "json") {
      try {
        args[field.key] = JSON.parse(text);
      } catch {
        return { error: `"${field.key}"는 JSON 형식이어야 해요.` };
      }
    } else args[field.key] = field.kind === "string" ? value : text;
  }
  return { args };
}
