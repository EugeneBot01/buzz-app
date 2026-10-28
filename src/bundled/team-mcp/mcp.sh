# Buzz Team: manages the MCP servers of the user's Claude Code, so Buzz's
# Claude agents and the `claude` in a terminal share one list. The plugin runs
# it as `bash -c` (see index.tsx), each time with one of these steps:
#
#   list                              prints the user's MCP servers as JSON
#   add-remote NAME http|sse URL      connects a remote server
#   add-command NAME "COMMAND LINE"   connects a server started by a command
#   remove NAME                       disconnects a server
#
# Values arrive as arguments and are never spliced into a shell string, except
# a command line, which is run by `sh -c` when Claude starts that server.
set -eu

# Buzz's own copy of Claude first, then any `claude` the user installed.
find_claude() {
  if [ "$(uname)" = Darwin ]; then
    dir="$HOME/Library/Application Support/Buzz/claude-code"
  else
    dir="${XDG_DATA_HOME:-$HOME/.local/share}/buzz/claude-code"
  fi
  version=$(cat "$dir/current" 2>/dev/null || true)
  case "$version" in "" | [!0-9]* | *[!0-9.]*) version="" ;; esac
  if [ -n "$version" ] && [ -x "$dir/$version/claude" ]; then
    printf '%s\n' "$dir/$version/claude"
    return 0
  fi
  if command -v claude >/dev/null 2>&1; then
    command -v claude
    return 0
  fi
  for candidate in "$HOME/.claude/local/claude" "$HOME/.local/bin/claude" \
    /opt/homebrew/bin/claude /usr/local/bin/claude; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

valid_name() {
  case "$1" in "" | [!a-z0-9]* | *[!a-z0-9_-]*) return 1 ;; esac
  [ "${#1}" -le 40 ]
}

step="${1:-}"
[ -n "$step" ] || { echo "Missing step" >&2; exit 2; }
shift
case "$step" in
list)
  file="$HOME/.claude.json"
  [ -f "$file" ] || { echo "{}"; exit 0; }
  # plutil ships with macOS and reads JSON; a file without servers prints {}.
  /usr/bin/plutil -extract mcpServers json -o - -- "$file" 2>/dev/null || echo "{}"
  ;;
add-remote)
  name="${1:-}" transport="${2:-}" url="${3:-}"
  valid_name "$name" || { echo "Invalid name" >&2; exit 2; }
  case "$transport" in http | sse) ;; *) echo "Invalid transport" >&2; exit 2 ;; esac
  case "$url" in
  https://* | http://127.0.0.1[:/]* | http://localhost[:/]*) ;;
  *) echo "Only https addresses are allowed" >&2; exit 2 ;;
  esac
  claude=$(find_claude) || { echo "Claude is not installed" >&2; exit 127; }
  "$claude" mcp remove -s user "$name" >/dev/null 2>&1 || true
  exec "$claude" mcp add --transport "$transport" -s user "$name" "$url"
  ;;
add-command)
  name="${1:-}" line="${2:-}"
  valid_name "$name" || { echo "Invalid name" >&2; exit 2; }
  [ -n "$line" ] || { echo "Missing command" >&2; exit 2; }
  claude=$(find_claude) || { echo "Claude is not installed" >&2; exit 127; }
  "$claude" mcp remove -s user "$name" >/dev/null 2>&1 || true
  exec "$claude" mcp add -s user "$name" -- /bin/sh -c "$line"
  ;;
remove)
  name="${1:-}"
  valid_name "$name" || { echo "Invalid name" >&2; exit 2; }
  claude=$(find_claude) || { echo "Claude is not installed" >&2; exit 127; }
  exec "$claude" mcp remove -s user "$name"
  ;;
*)
  echo "Unknown step: $step" >&2
  exit 2
  ;;
esac
