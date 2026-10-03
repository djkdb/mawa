# 내 GitHub 계정으로 한 번 돌려보기 (약 15분)

데모는 가상의 샘플 데이터입니다. 이 문서는 **내 컴퓨터에서, 내 GitHub 데이터로** 에이전트를 실제로 돌리고 화면을 녹화하는 방법입니다. 토큰은 내 컴퓨터 터미널에만 넣고, 채팅·코드·커밋에는 절대 넣지 않습니다.

## 1. 준비 (한 번만)
```sh
git clone https://github.com/djkdb/mawa.git && cd mawa
git checkout claude/busy-einstein-a5xqac
npm install
npm run build
```
Node 22 이상이 필요합니다. AI 모드로 돌리려면 Claude Code가 설치·로그인되어 있어야 합니다(`claude --version`).

## 2. GitHub 토큰 만들기 (읽기 전용, 7일)
1. GitHub → Settings → Developer settings → **Personal access tokens → Fine-grained tokens → Generate new token**
2. 이름: `mawa-demo`, 만료: **7일**
3. Repository access: **Only select repositories** → 보여줄 저장소 1~3개 선택
4. Permissions(Repository): **Contents: Read-only**, **Issues: Read-only**, **Pull requests: Read-only** (Metadata는 자동으로 Read-only)
5. 생성된 토큰을 복사합니다. 이 화면은 녹화하지 마세요.

## 3. 실행
```sh
read -s GITHUB_TOKEN && export GITHUB_TOKEN   # 붙여넣고 Enter (화면에 안 보임)
LLM_PROVIDER=claude-cli npm run ask -- --mode=real "이번 주 내 GitHub 활동이랑 리뷰 대기 정리해줘."
```
**Windows PowerShell**은 `read`가 없으므로 이렇게 넣습니다. 첫 줄은 그대로 입력하고 Enter → `GitHub token:` 칸에 붙여넣기:
```powershell
$s = Read-Host -AsSecureString "GitHub token"
$env:GITHUB_TOKEN = [System.Net.NetworkCredential]::new("", $s).Password
$env:LLM_PROVIDER = "claude-cli"
npm run ask -- --mode=real "이번 주 내 GitHub 활동이랑 리뷰 대기 정리해줘."
```
토큰을 명령 줄에 직접 쓰지 마세요. PowerShell은 입력한 명령을 기록 파일에 남깁니다. 실수했다면 `Remove-Item (Get-PSReadLineOption).HistorySavePath` 후 토큰을 삭제·재발급하세요. `claude`를 못 찾으면 `$env:CLAUDE_BIN = "<claude.exe 또는 cli.js 경로>"`로 지정합니다.

- AI 없이 스크립트로만 보려면 `LLM_PROVIDER=` 부분을 빼고 실행합니다.
- 실제 모드에서는 토큰이 있는 서버(GitHub)만 켜집니다. 화면 첫 줄에 `real data`가 보여야 합니다.

## 4. 녹화
- macOS: `Cmd + Shift + 5` → 화면 일부 녹화 → 터미널 창만 선택
- Windows: `Win + Alt + R` (Xbox Game Bar) 또는 `Win + Shift + S`의 녹화
- 녹화할 것: 명령 입력 → MCP 서버 연결 → AI가 고른 도구 → 리포트. 토큰 입력 줄은 `read -s`라 보이지 않습니다.

## 5. 끝나면
- GitHub의 토큰 화면에서 **Delete** (또는 7일 뒤 자동 만료)
- 터미널을 닫으면 `GITHUB_TOKEN` 환경변수도 사라집니다.

## 무엇이 어디로 가나
- 에이전트는 GitHub **읽기 API만** 호출합니다. 쓰기 도구는 없습니다.
- AI 모드에서는 도구 결과(마스킹 후)가 Claude Code를 통해 Anthropic 모델로 갑니다. 보내고 싶지 않은 저장소는 2-3에서 고르지 마세요.
