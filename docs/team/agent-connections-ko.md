# 에이전트에 노션·피그마·워드 연결하기 (Buzz Team)

Buzz Team의 **Claude 에이전트**는 그 맥의 Claude Code에 등록된 연결(MCP)을 그대로 씁니다.
그래서 에이전트를 돌리는 맥에서 아래 명령을 **한 번만** 실행하면, 그 맥의 모든 Claude 에이전트가 쓸 수 있어요.

- 에이전트를 만든 사람(에이전트가 도는 맥)만 하면 돼요. 다른 팀원은 안 해도 돼요.
- Codex 에이전트는 공식 설계상 외부 연결을 쓰지 않아요.
- 명령을 실행한 뒤에는 **Buzz를 껐다 켜야** 적용돼요.

## 워드·엑셀·PPT (ArtCraft)

앱 설치와 에이전트 연결을 한 번에 해요. 터미널에 붙여 넣으세요.

```bash
curl -fsSL https://raw.githubusercontent.com/EugeneBot01/buzz-app/team/scripts/team/install-artcraft.sh | bash
```

에이전트가 만든 파일은 홈 폴더의 `BuzzArtCraft` 폴더에 생기고, 대화방에 첨부돼서 와요.

## 노션

```bash
claude mcp add --transport http -s user notion https://mcp.notion.com/mcp
```

처음 한 번은 로그인이 필요해요. 터미널에서 `claude`를 실행한 뒤 `/mcp`를 입력하고, notion을 골라 브라우저에서 로그인하세요.

## 피그마

1. 피그마 데스크톱 앱 → 메뉴 → 기본 설정 → **Dev Mode MCP 서버 사용**을 켜요.
2. 터미널에 붙여 넣어요.

```bash
claude mcp add --transport http -s user figma http://127.0.0.1:3845/mcp
```

피그마 앱이 켜져 있을 때만 쓸 수 있어요.

## 연결 확인·지우기

```bash
claude mcp list
```

```bash
claude mcp remove -s user notion
```
