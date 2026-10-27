#!/usr/bin/env bash
# ArtCraft apps for Buzz Team (macOS).
#
#   curl -fsSL https://raw.githubusercontent.com/EugeneBot01/buzz-app/team/scripts/team/install-artcraft.sh | bash
#
# Installs WordCraft, GridCraft and DeckCraft (open-source Word / Excel /
# PowerPoint, github.com/storytold) so that Buzz's "열기" button opens
# .docx / .xlsx / .pptx in them, and puts their
# command-line tools where Buzz agents look for them
# (~/Library/Application Support/ArtCraft/bin). Apps go to ~/Applications, so
# no administrator password is needed. Every download is checked against the
# release's SHA256SUMS.txt before anything is installed.
#
# ARTCRAFT_APPS="wordcraft gridcraft deckcraft pdfcraft" also installs PdfCraft.

set -euo pipefail

{
APPS="${ARTCRAFT_APPS:-wordcraft gridcraft deckcraft}"
BIN="$HOME/Library/Application Support/ArtCraft/bin"
APP_DIR="$HOME/Applications"

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\n[오류] %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == Darwin ]] || die "맥에서만 설치할 수 있어요."
mkdir -p "$BIN" "$APP_DIR" "$HOME/BuzzArtCraft"

TMP=$(mktemp -d)
cleanup() {
  for v in "$TMP"/mnt-*; do [[ -d "$v" ]] && hdiutil detach -quiet "$v" 2>/dev/null || true; done
  rm -rf "$TMP" 2>/dev/null || true
}
trap cleanup EXIT

for app in $APPS; do
  [[ "$app" =~ ^[a-z]+craft$ ]] || die "알 수 없는 앱 이름: $app"
  say "$app 최신 버전 확인 중"
  json=$(curl -fsSL "https://api.github.com/repos/storytold/$app/releases/latest") \
    || die "$app 정보를 가져오지 못했어요. 인터넷 연결을 확인해 주세요."
  urls=$(printf '%s' "$json" | grep -o '"browser_download_url": *"[^"]*"' | sed 's/.*"\(https[^"]*\)"$/\1/')
  dmg_url=$(printf '%s\n' "$urls" | grep -E "/$app-[0-9.]+-macos-universal\.dmg$" | head -1)
  cli_url=$(printf '%s\n' "$urls" | grep -E "/$app-cli-[0-9.]+-macos-universal\.zip$" | head -1)
  sums_url=$(printf '%s\n' "$urls" | grep -E "/SHA256SUMS\.txt$" | head -1)
  [[ -n "$dmg_url" && -n "$cli_url" && -n "$sums_url" ]] || die "$app 맥용 파일을 찾지 못했어요."

  say "$app 다운로드 중"
  curl -fL --progress-bar "$dmg_url" -o "$TMP/$app.dmg" || die "$app 다운로드에 실패했어요."
  curl -fL --progress-bar "$cli_url" -o "$TMP/$app-cli.zip" || die "$app 도구 다운로드에 실패했어요."
  curl -fsSL "$sums_url" -o "$TMP/$app-sums.txt" || die "$app 확인용 파일을 받지 못했어요."

  for pair in "$TMP/$app.dmg:${dmg_url##*/}" "$TMP/$app-cli.zip:${cli_url##*/}"; do
    file="${pair%%:*}"; name="${pair#*:}"
    want=$(grep -E "[[:space:]]\*?$name\$" "$TMP/$app-sums.txt" | awk '{print $1}' | head -1)
    got=$(shasum -a 256 "$file" | awk '{print $1}')
    [[ -n "$want" && "$want" == "$got" ]] || die "$name 파일이 원본과 달라요. 설치를 중단했어요."
  done

  say "$app 설치 중"
  mnt="$TMP/mnt-$app"; mkdir -p "$mnt"
  hdiutil attach -nobrowse -readonly -mountpoint "$mnt" "$TMP/$app.dmg" >/dev/null || die "$app 설치 파일을 열지 못했어요."
  bundle=$(find "$mnt" -maxdepth 1 -name '*.app' | head -1)
  [[ -n "$bundle" ]] || die "$app 설치 파일 안에 앱이 없어요."
  # Gatekeeper's own check: signed by a Developer ID and notarized by Apple.
  spctl -a -t exec "$bundle" 2>/dev/null || die "$app 앱이 애플 확인(공증)을 통과하지 못했어요. 설치를 중단했어요."
  target="$APP_DIR/$(basename "$bundle")"
  rm -rf "$target"
  ditto "$bundle" "$target"
  hdiutil detach -quiet "$mnt" || true

  unzip -oq "$TMP/$app-cli.zip" -d "$TMP/$app-cli"
  cli=$(find "$TMP/$app-cli" -type f -name "$app-cli" | head -1)
  [[ -n "$cli" ]] || die "$app 도구를 찾지 못했어요."
  install -m 0755 "$cli" "$BIN/$app-cli"
  echo "$("$BIN/$app-cli" --version 2>/dev/null || echo "$app-cli") 설치됨"
done

# Buzz Team's Claude agents use the MCP servers registered with Claude Code
# for the user, so register each app's own server there. Every server works
# inside ~/BuzzArtCraft; WordCraft is also confined to it.
CLAUDE=$(command -v claude || true)
[[ -z "$CLAUDE" && -x "$HOME/.claude/local/claude" ]] && CLAUDE="$HOME/.claude/local/claude"
connected=""
if [[ -n "$CLAUDE" ]]; then
  say "에이전트(Claude)에 연결 중"
  for app in $APPS; do
    [[ -x "$BIN/$app-cli" ]] || continue
    roots=""
    [[ "$app" == wordcraft ]] && roots=' --automation-read-root "$HOME/BuzzArtCraft" --automation-write-root "$HOME/BuzzArtCraft"'
    "$CLAUDE" mcp remove -s user "$app" >/dev/null 2>&1 || true
    if "$CLAUDE" mcp add -s user "$app" -- /bin/sh -c \
      "mkdir -p \"\$HOME/BuzzArtCraft\" && cd \"\$HOME/BuzzArtCraft\" && exec \"\$HOME/Library/Application Support/ArtCraft/bin/$app-cli\" mcp$roots" >/dev/null; then
      connected="$connected $app"
    fi
  done
fi

if [[ -n "$connected" ]]; then
  cat <<'DONE'

완료! 이제 Buzz에서 워드·엑셀·PPT 파일 옆의 "열기"를 누르면 이 앱으로 열려요.
이 맥에서 도는 Claude 에이전트도 이 앱들을 쓸 수 있어요. (Buzz를 껐다 켜면 적용돼요)
에이전트가 만든 파일은 대화방에 첨부돼서 와요. (작업 폴더: Finder에서 ⌘+Shift+H → BuzzArtCraft)
DONE
else
  cat <<'DONE'

완료! 이제 Buzz에서 워드·엑셀·PPT 파일 옆의 "열기"를 누르면 이 앱으로 열려요.
(이 맥에 Claude Code가 없어서 에이전트 연결은 건너뛰었어요. Claude Code를 설치한 뒤 이 명령을 한 번 더 실행하면 연결돼요.)
DONE
fi
}
