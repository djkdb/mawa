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

---

# 웹 서비스로 실행하기 — 제출 영상 녹화용 (브라우저만 녹화)

터미널 대신 브라우저에서 **연결 → 질문 → 실시간 활동 → 리포트·출처** 흐름을 보여 줍니다. 토큰을 붙여넣지 않고, GitHub 승인 화면에서 **읽기 전용** 권한을 승인합니다. 터미널은 띄워 두기만 하고 녹화하지 않습니다.

> 이 순서는 가짜 GitHub(OAuth + REST)와 가짜 `claude`로 `npm run dev`(tsx + vite dev)와 빌드 결과(`e2e/web-real.spec.ts`) 양쪽에서 끝까지 돌려 확인했습니다. 실제 GitHub App과 실제 Claude 로그인 부분은 아래 체크리스트를 직접 따라 하세요.

## 체크리스트

### ☐ 1. GitHub App 만들기 (읽기 전용, 5분, 한 번만)
GitHub → Settings → Developer settings → **GitHub Apps → New GitHub App**

| 항목 | 값 |
|---|---|
| GitHub App name | `mawa-local-<아이디>` (전역에서 유일) |
| Homepage URL | `http://localhost:5173` |
| Callback URL | `http://localhost:3001/auth/github/callback` (doctor가 출력하는 값과 같아야 함) |
| Expire user authorization tokens | 켜 둔 그대로 (8시간 토큰 + 자동 갱신, 서버가 처리) |
| Request user authorization (OAuth) during installation | 끔 |
| Webhook → Active | **체크 해제** |
| Repository permissions | **Contents · Issues · Pull requests → Read-only** (Metadata는 자동 Read-only). 나머지는 No access |
| Account permissions | 모두 No access |
| Where can this GitHub App be installed | **Only on this account** |

**Create GitHub App** → 앱 화면에서
- **Client ID** 복사, **Generate a new client secret** → 복사 (이 화면은 녹화하지 않음). Private key는 필요 없습니다.
- 왼쪽 **Install App** → 내 계정 → **Only select repositories** → 영상에 보여줄 저장소만 선택.
  (공개되면 안 되는 저장소는 고르지 마세요. 리포트에 커밋·PR 제목이 그대로 나옵니다.)

### ☐ 2. `.env` 만들기 (mawa 폴더, git에 올라가지 않음)
```powershell
copy .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
notepad .env
```
아래 줄을 찾아 바꾸고 저장 (값은 채팅·화면에 내보내지 않기):
```
AGENT_MODE=real
LLM_PROVIDER=claude-cli
GITHUB_CLIENT_ID=<Client ID>
GITHUB_CLIENT_SECRET=<client secret>
GITHUB_OAUTH_SCOPES=
SESSION_ENCRYPTION_KEY=<위 node 명령이 출력한 64자리>
```
- `GITHUB_OAUTH_SCOPES=`는 **값을 비운 채로** 둡니다. GitHub App은 scope 대신 앱 권한(읽기 전용)을 씁니다. 줄이 없으면 OAuth App 기본값(`repo`, 쓰기 포함)을 요청합니다.
- `LLM_API_KEY`는 비워 둡니다. AI는 내 Claude Code 로그인으로 돌아갑니다.

### ☐ 3. 점검
```powershell
npm run build
npm run doctor
```
(4단계 `npm run start:real`이 이 둘을 자동으로 먼저 실행합니다.) 모두 ✓ 이고 마지막 줄이 `✓ 실행 준비됨`이면 됩니다. doctor는 값을 출력하지 않고 있음/없음/형식만 봅니다.
- `claude 로그인 실패` → `claude` 실행 → `/login` → 브라우저 승인 → `/exit` → 다시 doctor
- `claude를 실행하지 못함` → `.env`에 `CLAUDE_BIN=<where.exe claude 로 나온 claude.exe 경로>`
- `포트 3001/5173 사용 중` → 켜 둔 `npm run dev` 창을 닫기 (doctor가 알려주는 `netstat`/`taskkill` 사용)
- 로그인 확인은 모델에 아주 짧은 요청을 한 번 보냅니다. 건너뛰려면 `npm run doctor -- --no-login`

### ☐ 4. 실행
```powershell
npm run start:real
```
빌드 → `npm run doctor` → API(빌드 결과를 node로 실행) + 웹(:5173)을 한 번에 켭니다. doctor가 ✗를 찾으면 거기서 멈추고 고칠 방법을 보여 줍니다. `[api] listening on http://127.0.0.1:3001`과 `[web] Local: http://localhost:5173/`이 보이면 정상입니다. 이 창은 그대로 두고 녹화 화면 밖으로 옮깁니다. 끌 때는 `Ctrl + C`.

> Windows에서 `npm run dev`로는 API가 뜨지 않는 경우가 있었습니다(`tsx watch`). `start:real`은 그 경로를 쓰지 않습니다. 개발 중 코드 자동 반영이 필요할 때만 `npm run dev`를 쓰세요.

### ☐ 5. 연결 (녹화 전, 한 번)
1. 브라우저에서 **`http://localhost:5173/?record=1#/connections`** 를 엽니다.
   `?record=1`은 녹화 모드입니다. 연결 카드·사이드바·인사말의 GitHub 계정 이름을 「내 계정」으로 가립니다(탭을 닫을 때까지 유지, 끄려면 `?record=0`). 리포트 내용(커밋·PR 제목)은 그대로 나옵니다.
2. GitHub 줄의 **연결** → GitHub 승인 화면 → **Authorize**. (앱 설치 화면이 나오면 1단계에서 고른 저장소 그대로 Install)
3. 홈으로 돌아와 「GitHub 연결됨. 홈에서 질문을 실행하세요.」가 보이면 성공입니다.
   GitHub가 `redirect_uri` 오류를 보이면 1단계 Callback URL과 doctor가 출력한 값이 같은지 확인하세요.
4. **리허설 한 번**: 홈에서 질문을 실행해 리포트까지 나오는지 봅니다. 실패하면 화면에 실패로 표시되고(샘플로 채우지 않음), `npm run dev` 창에 원인이 나옵니다.

### ☐ 6. 녹화 (브라우저 창만)
녹화 도구: Windows `Win + Alt + R`(Xbox Game Bar, 활성 창만 녹화) 또는 OBS의 "윈도우 캡처". 터미널·메모장·GitHub 설정 탭은 닫거나 다른 창으로.

녹화 순서 (약 2분):
1. `http://localhost:5173/?record=1` 홈 — 사이드바 워크스페이스가 「내 계정」인지 확인 후 **녹화 시작**
2. **연결** 메뉴 — GitHub 「연결됨 (내 계정)」, 「연결할 때 요청하는 권한」에서 *GitHub App 권한 사용 (scope 파라미터 없음)* 을 잠깐 보여줌
3. **홈** — 모드가 **실제**인지 확인 → 직접 입력: `이번 주 내 GitHub 활동이랑 리뷰 대기 정리해줘.` → **에이전트 실행**
4. 위쪽에 고정된 한 줄 **「실제 실행 · 실제 데이터 · <시작 시각> · claude-cli/<모델>」** 이 뜹니다. 실행 이벤트에서 나온 값이라 데모 실행에서는 뜨지 않습니다.
5. **에이전트 활동** — 모델이 고른 GitHub 도구 호출이 SSE로 하나씩 올라오는 것을 보여줌 (약 1분, 편집에서 배속 가능)
6. 「리포트 완성」 → **리포트 보기** — 오른쪽 위 「실제 데이터」, 출처 칩 하나를 눌러 원본(커밋/PR) 보여주기
7. **AI가 본 내 데이터** — 모델에 보낸 것·가린 것과 서명된 감사 로그 → **녹화 종료**

### ☐ 7. 끝나면
- 연결 화면의 GitHub **해제** (GitHub 쪽 승인도 함께 취소). 필요 없으면 GitHub App 자체를 Settings → Developer settings에서 삭제
- `npm run dev` 창은 `Ctrl + C`
- `.env`는 내 PC에만 있습니다. 커밋하지 마세요 (`.gitignore`에 들어 있음)

## Gmail·Google Calendar 연결 (선택, 10분, 무료)

내 계정 하나만 쓰는 용도라 Google 심사는 필요 없습니다(「테스트」 상태 + 테스트 사용자에 나 추가). 권한은 **읽기 전용**(`gmail.readonly`, `calendar.readonly`)만 요청합니다.

1. **프로젝트**: https://console.cloud.google.com → 위쪽 프로젝트 선택 → **새 프로젝트** → 이름 `mawa-local` → 만들기
2. **API 켜기**: 왼쪽 메뉴 **API 및 서비스 → 라이브러리** → `Gmail API` 검색 → **사용** / 다시 라이브러리 → `Google Calendar API` → **사용**
3. **동의 화면**: **API 및 서비스 → OAuth 동의 화면**(또는 **Google 인증 플랫폼**) → 시작하기
   - 앱 이름 `mawa-local`, 사용자 지원 이메일·개발자 연락처 = 내 Gmail
   - 대상(User type): **외부(External)** → 만들기
   - **대상 → 테스트 사용자 → 사용자 추가** → **내 Gmail 주소** 추가 (이게 없으면 로그인 때 "액세스 차단됨")
   - 게시 상태는 **테스트** 그대로 둡니다
4. **클라이언트 만들기**: **사용자 인증 정보(또는 클라이언트) → 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**, 이름 `mawa-local-web`
   - **승인된 리디렉션 URI** → URI 추가: `http://localhost:3001/auth/google/callback` (doctor가 출력하는 값과 같아야 함)
   - 만들기 → **클라이언트 ID**와 **클라이언트 보안 비밀번호**를 복사 (채팅에 붙여넣지 않기)
5. **`.env`에 추가** (`notepad .env`):
   ```
   GOOGLE_CLIENT_ID=<클라이언트 ID>
   GOOGLE_CLIENT_SECRET=<클라이언트 보안 비밀번호>
   ```
6. 서버를 껐다 켜기: `Ctrl + C` → `npm run start:real` (doctor에 `✓ Google OAuth 있음`)
7. 웹 **연결** 화면 → Gmail(또는 Calendar) 줄의 **연결** → Google 로그인
   - "Google에서 확인하지 않은 앱" 화면이 나오면 **고급 → mawa-local(으)로 이동(안전하지 않음)** — 내가 만든 앱이라 정상입니다
   - 권한 화면에서 **Gmail 읽기**와 **캘린더 읽기**에 체크 → 계속
8. 연결 화면에 Gmail·Google Calendar가 「연결됨」이면 끝. 홈에서 "마감 순서"나 "이번 주 정리"를 실행하면 메일·일정까지 읽습니다.

알아 둘 것
- 테스트 상태의 Google 앱은 **7일마다** 다시 연결해야 합니다(refresh token 만료). 만료되면 연결 화면에서 해제 → 연결.
- 메일 본문은 AI에 보내기 전에 메일 주소·전화번호·학번 등이 가려집니다(「AI가 본 내 데이터」에서 확인). 녹화할 때는 `?record=1`로 계정 이름을 가리고, 메일 제목이 공개돼도 괜찮은지 미리 보세요.
- 그만 쓰려면 연결 화면의 **해제**(Google 쪽 권한도 취소) → 필요 없으면 Cloud Console에서 프로젝트 삭제.

## 자주 막히는 곳
| 증상 | 원인 → 해결 |
|---|---|
| 모드에서 **실제**가 눌리지 않음 | GitHub 미연결 → 5단계 |
| `GitHub OAuth not configured` | `.env`의 Client ID/secret 누락 → doctor |
| 실행 직후 실패 `claude CLI not available` | API가 claude를 못 찾음 → `.env`에 `CLAUDE_BIN` |
| 실패 `OAuth session expired` | Claude Code 로그인 만료 → `claude` → `/login` |
| 서버를 껐다 켜니 다시 연결하라고 함 | `SESSION_ENCRYPTION_KEY` 없음 → 2단계 |
| 리포트에 저장소가 하나도 없음 | App을 설치하지 않았거나 저장소를 안 고름 → 1단계 Install App |

---

# 클라우드 세션에서 녹화하기 (`npm run record:web`)

다른 Claude Code 클라우드 세션(예: insta_auto)이 **직접** 실제 모드로 돌리고 브라우저 화면을 영상으로 남기는 방법입니다. 클라우드의 브라우저는 github.com 승인 버튼을 누를 수 없으므로, GitHub는 **환경 변수에 넣은 읽기 전용 토큰**으로 연결합니다. AI는 그 세션의 Claude Code 로그인(`claude -p`)을 씁니다.

## 사람이 할 일 (한 번)
1. **읽기 전용 토큰 만들기**: GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
   - Expiration 7일 · Repository access **Only select repositories**(영상에 보여줄 저장소) · Permissions: **Contents / Issues / Pull requests → Read-only**
2. **녹화할 세션의 환경에 넣기**: 그 세션 제목 줄의 클라우드 환경 메뉴 → **Edit** → 환경 변수에 `MAWA_GITHUB_TOKEN=<토큰>` 추가 → 저장. 새로 시작한 세션부터 적용됩니다.
   - 채팅에는 절대 붙여넣지 않습니다. `GITHUB_TOKEN`이 아니라 **`MAWA_GITHUB_TOKEN`** 입니다(클라우드가 `GITHUB_TOKEN`을 따로 씀).
3. 녹화가 끝나면 GitHub에서 토큰을 **Delete**, 환경 변수도 삭제.

## 세션이 할 일
```sh
git clone https://github.com/djkdb/mawa.git && cd mawa
git checkout claude/busy-einstein-a5xqac
npm install && npm run build
npm run record:web -- "이번 주 내 GitHub 활동이랑 리뷰 대기 정리해줘."
```
- 결과: `recordings/mawa-real-run-<시각>.mp4`(+ `.webm`)와 `.json`(runId · 시작 시각 · 실제 쓰인 모델 · 상태 · 도구 호출 수). `recordings/`는 git에 올라가지 않습니다(실제 계정 데이터).
- 화면 순서: 홈 → 연결(「연결됨 (내 계정)」, 읽기 전용 권한) → 질문 입력·실행 → 「실제 실행 · 실제 데이터 · 시각 · claude-cli/모델」 줄과 실시간 활동 → 리포트 → 출처 하나 → AI가 본 내 데이터. 마우스 위치는 파란 점으로 보입니다.
- 꾸미지 않습니다: 실행이 실패하면 영상에 실패 화면이 남고 스크립트는 실패(종료 코드 1)로 끝납니다.
- 시각은 Asia/Seoul로 표시됩니다. 실제 실행이면 1~2분 걸리고, 기다리는 구간은 편집에서 배속하면 됩니다.
