/** MCP connections (Buzz Team): the rules behind the "MCP 연결" settings card. */

export type McpTransport = "http" | "sse";
export type AddSpec =
  | Readonly<{
      kind: "remote";
      name: string;
      transport: McpTransport;
      url: string;
    }>
  | Readonly<{ kind: "command"; name: string; commandLine: string }>;

export type McpServer = Readonly<{
  name: string;
  /** What it connects to: an address, or the command that starts it. */
  target: string;
  kind: "remote" | "command";
}>;

export type McpPreset = Readonly<{
  id: string;
  label: string;
  description: string;
  /** Shown under the row when it needs something first. */
  note?: string;
  spec: AddSpec;
}>;

export const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const MAX_COMMAND = 600;

/** Only https, or an app on this computer (Figma's server), is allowed. */
export function validateUrl(raw: string): string | null {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "주소를 https:// 로 시작해서 넣어 주세요.";
  }
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  if (url.protocol === "https:" && url.hostname.includes(".")) return null;
  if (url.protocol === "http:" && local) return null;
  return "https 주소만 쓸 수 있어요. (이 컴퓨터의 앱은 http://127.0.0.1 도 돼요)";
}

export function validateName(name: string): string | null {
  return NAME_PATTERN.test(name)
    ? null
    : "이름은 영어 소문자·숫자·-·_ 로 40자까지 쓸 수 있어요.";
}

export function validateCommand(line: string): string | null {
  const text = line.trim();
  if (!text) return "실행할 명령을 넣어 주세요.";
  if (text.length > MAX_COMMAND) return "명령이 너무 길어요.";
  if (/[\r\n]/.test(text)) return "명령은 한 줄로 써 주세요.";
  return null;
}

/** The arguments `mcp.sh` takes after its own name. */
export function scriptArgs(spec: AddSpec): string[] {
  return spec.kind === "remote"
    ? ["add-remote", spec.name, spec.transport, spec.url.trim()]
    : ["add-command", spec.name, spec.commandLine.trim()];
}

/** The servers in `mcp.sh list` output: `{ name: { type, url | command, args } }`. */
export function parseServers(json: string): McpServer[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const servers: McpServer[] = [];
  for (const [name, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const url = typeof entry.url === "string" ? entry.url : undefined;
    const command =
      typeof entry.command === "string" ? entry.command : undefined;
    const args = Array.isArray(entry.args)
      ? entry.args.filter((arg): arg is string => typeof arg === "string")
      : [];
    if (url) servers.push({ name, kind: "remote", target: url });
    else if (command)
      servers.push({
        name,
        kind: "command",
        target: [command, ...args].join(" "),
      });
  }
  return servers.sort((a, b) => a.name.localeCompare(b.name));
}

const artcraft = (app: string, confine: boolean) =>
  `mkdir -p "$HOME/BuzzArtCraft" && cd "$HOME/BuzzArtCraft" && exec "$HOME/Library/Application Support/ArtCraft/bin/${app}-cli" mcp${
    confine
      ? ' --automation-read-root "$HOME/BuzzArtCraft" --automation-write-root "$HOME/BuzzArtCraft"'
      : ""
  }`;

const ARTCRAFT_NOTE =
  "먼저 ArtCraft 설치가 필요해요. (docs/team/agent-connections-ko.md 의 설치 한 줄)";

export const PRESETS: readonly McpPreset[] = [
  {
    id: "notion",
    label: "노션",
    description: "노션 페이지를 읽고 씁니다.",
    note: "처음 한 번 브라우저에서 로그인해야 해요.",
    spec: {
      kind: "remote",
      name: "notion",
      transport: "http",
      url: "https://mcp.notion.com/mcp",
    },
  },
  {
    id: "figma",
    label: "피그마 (데스크톱 앱)",
    description: "피그마에서 고른 화면의 구조와 스타일을 가져옵니다.",
    note: "피그마 앱 → 기본 설정 → Dev Mode MCP 서버를 켜 둬야 하고, 앱이 켜져 있을 때만 써요.",
    spec: {
      kind: "remote",
      name: "figma",
      transport: "http",
      url: "http://127.0.0.1:3845/mcp",
    },
  },
  {
    id: "linear",
    label: "리니어",
    description: "리니어 이슈를 찾고 만듭니다.",
    note: "처음 한 번 브라우저에서 로그인해야 해요.",
    spec: {
      kind: "remote",
      name: "linear",
      transport: "http",
      url: "https://mcp.linear.app/mcp",
    },
  },
  {
    id: "atlassian",
    label: "지라 · 컨플루언스",
    description: "지라 이슈와 컨플루언스 문서를 다룹니다.",
    note: "처음 한 번 브라우저에서 로그인해야 해요.",
    spec: {
      kind: "remote",
      name: "atlassian",
      transport: "sse",
      url: "https://mcp.atlassian.com/v1/sse",
    },
  },
  {
    id: "context7",
    label: "Context7 (최신 문서 검색)",
    description: "라이브러리의 최신 공식 문서를 찾아 줍니다. 오픈소스예요.",
    note: "이 맥에 Node.js(npx)가 있어야 해요.",
    spec: {
      kind: "command",
      name: "context7",
      commandLine: "npx -y @upstash/context7-mcp",
    },
  },
  {
    id: "playwright",
    label: "Playwright (브라우저 조작)",
    description: "웹페이지를 직접 열고 눌러 봅니다. 오픈소스예요.",
    note: "이 맥에 Node.js(npx)가 있어야 해요.",
    spec: {
      kind: "command",
      name: "playwright",
      commandLine: "npx -y @playwright/mcp@latest",
    },
  },
  {
    id: "wordcraft",
    label: "워드 문서 (WordCraft)",
    description:
      "워드 문서를 만들고 고칩니다. 홈 폴더의 BuzzArtCraft 안 파일만 다뤄요.",
    note: ARTCRAFT_NOTE,
    spec: {
      kind: "command",
      name: "wordcraft",
      commandLine: artcraft("wordcraft", true),
    },
  },
  {
    id: "gridcraft",
    label: "엑셀 (GridCraft)",
    description: "엑셀 표를 만들고 계산합니다.",
    note: ARTCRAFT_NOTE,
    spec: {
      kind: "command",
      name: "gridcraft",
      commandLine: artcraft("gridcraft", false),
    },
  },
  {
    id: "deckcraft",
    label: "PPT (DeckCraft)",
    description: "프레젠테이션을 만들고 고칩니다.",
    note: ARTCRAFT_NOTE,
    spec: {
      kind: "command",
      name: "deckcraft",
      commandLine: artcraft("deckcraft", false),
    },
  },
];

// ---- running a server so a person can use its tools ----

type RawEntry = Readonly<{
  type?: unknown;
  url?: unknown;
  command?: unknown;
  args?: unknown;
  env?: unknown;
  headers?: unknown;
}>;

/** The servers by name, as Claude Code stores them. */
export function parseEntries(json: string): Record<string, RawEntry> {
  try {
    const raw: unknown = JSON.parse(json);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, RawEntry] =>
          !!entry[1] && typeof entry[1] === "object",
      ),
    );
  } catch {
    return {};
  }
}

/** One word for `sh`, however odd its characters. */
export const shellQuote = (text: string) =>
  `'${text.replaceAll("'", `'\\''`)}'`;

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
const pairs = (value: unknown): [string, string][] =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
    : [];

/**
 * The shell line that starts a server on stdio. A remote server goes through
 * `mcp-remote`, which speaks stdio to Buzz, talks to the address, and opens a
 * browser for sign-in the first time. Null when the entry names neither.
 */
export function launchLine(entry: RawEntry): string | null {
  if (typeof entry.url === "string" && entry.url) {
    if (validateUrl(entry.url)) return null;
    const parts = ["npx", "-y", "mcp-remote", entry.url];
    if (entry.url.startsWith("http://")) parts.push("--allow-http");
    if (entry.type === "sse") parts.push("--transport", "sse-only");
    for (const [name, value] of pairs(entry.headers))
      parts.push("--header", `${name}:${value}`);
    return `exec ${parts.map(shellQuote).join(" ")}`;
  }
  if (typeof entry.command === "string" && entry.command) {
    const env = pairs(entry.env)
      .filter(([name]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      .map(([name, value]) => `export ${name}=${shellQuote(value)};`)
      .join(" ");
    const command = [entry.command, ...strings(entry.args)]
      .map(shellQuote)
      .join(" ");
    return `${env ? `${env} ` : ""}exec ${command}`;
  }
  return null;
}
