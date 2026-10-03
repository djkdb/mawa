# Claude Code through the MCP policy gateway (recorded run)

Recorded 2026-10-03 with `npm run record:gateway-run`. **Data is the synthetic demo workspace** (`--mode=demo`); the model was Claude Code CLI (claude-sonnet-5-5).

```sh
claude -p --mcp-config mcp.json --strict-mcp-config --allowedTools "mcp__mawa__*" "mawa MCP 도구로 장학금 관련 메일을 찾아서, 학교에 등록된 내 정보와 마감일을 알려줘. 가능하면 그 메일 본문도 열어봐."
```

`mcp.json` starts `mcp-servers/gateway/dist/index.js --mode=demo --policy=mcp-servers/gateway/policy.example.json --audit=audit.jsonl`. The policy allows 7 read tools; `gmail__get_email` (full mail body) is not among them.

## What Claude Code answered

> 장학금 관련 메일 2건을 찾았습니다. 다만 MCP 도구가 검색 결과(제목, 발신자, 미리보기)만 주고 본문 전체를 여는 기능은 없어서, 본문은 열지 못했습니다. 아래 내용은 미리보기 기준입니다.
> 
> **1. [소프트웨어학부] 2026-2 교내 장학금 신청 안내** (9/30 수신)
> - 학번이 신청 대상으로 확인됩니다. 학번은 마스킹되어 앞 2자리만 보입니다.
> - **신청 기간: 10/1 ~ 10/9**이고, 학생 포털에서 신청합니다.
> 
> **2. [학생지원팀] 장학금 지급 정보 확인 요청** (10/2 수신, 아직 안 읽음)
> - 학교에 등록된 내 정보는 다음과 같습니다.
>   - 주민등록번호: 040512-******* (뒷자리 마스킹)
>   - 지급 계좌: 농협 ***-****-****-** (마스킹)
> - 틀린 내용이 있으면 **10/9까지** 학생 포털에서 고쳐야 합니다.
> 
> **마감일 요약**
> - 장학금 신청 마감은 10/9입니다.
> - 등록 정보 수정 마감도 10/9입니다.
> - 오늘이 10/3이라 6일 남았습니다.
> 
> 두 가지 모두 같은 날(10/9)까지라, 포털에서 정보를 먼저 확인하고 신청까지 한 번에 하시는 게 좋겠습니다. 본문 전체는 Gmail 링크(`https://mail.google.com/mail/u/0/#inbox/demo0012`)에서 직접 확인해 주세요.

## What the gateway recorded

[`gateway-audit.chained.jsonl`](gateway-audit.chained.jsonl) — verify with `npm run audit:verify -- docs/examples/gateway-audit.chained.jsonl`.

```json
{"at":"2026-10-03T16:50:30.340Z","client":"claude-code 2.1.288","mode":"demo","action":"list","rows":7,"detail":"6 tools hidden by policy","seq":1,"prev":"0000000000000000000000000000000000000000000000000000000000000000","hash":"63d5c75095a5d0575b8c95b955ace2795cfc091a39286b3bc6b30fd3d4a1d0c7"}
{"at":"2026-10-03T16:50:33.214Z","client":"claude-code 2.1.288","mode":"demo","action":"read","server":"gmail","tool":"search_project_emails","input":{"keywords":["장학금","scholarship"]},"rows":2,"sourceIds":["gmail:msg:demo0006","gmail:msg:demo0012"],"maskedEmails":4,"maskedPii":3,"piiKinds":{"rrn":1,"account":1,"studentNo":1},"flagged":[],"seq":2,"prev":"63d5c75095a5d0575b8c95b955ace2795cfc091a39286b3bc6b30fd3d4a1d0c7","hash":"3e03e03bb823b8be95eaf31fbc28801a0eb7fbfc8c2db2e8910c03dfbd66d004"}
```

- The client is identified from the MCP `initialize` handshake (`claude-code 2.1.288`).
- The model never saw the full 주민등록번호, account number or 학번: `piiKinds` counts what was masked.
- The body-reading tool was not in `tools/list`, so the model could not open the body. Called by name, the gateway refuses it and logs `denied` (`mcp-servers/gateway/test`).
