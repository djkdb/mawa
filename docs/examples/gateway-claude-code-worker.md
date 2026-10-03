# Claude Code through the MCP policy gateway (recorded run)

Recorded 2026-10-03 with `npm run record:gateway-run`. **Data is the synthetic demo workspace** (`--mode=demo`); the model was Claude Code CLI (claude-sonnet-5-5).

```sh
claude -p --mcp-config mcp.json --strict-mcp-config --allowedTools "mcp__mawa__*" "mawa MCP 도구로 고객사 정산 문의 메일과 인사팀 메일을 찾아서, 회신 마감과 고객 담당자 연락처, 등록된 급여 계좌를 알려줘. 가능하면 메일 본문도 열어봐."
```

`mcp.json` starts `mcp-servers/gateway/dist/index.js --mode=demo --policy=mcp-servers/gateway/policy.example.json --audit=audit.jsonl`. The policy allows 7 read tools; `gmail__get_email` (full mail body) is not among them.

## What Claude Code answered

> 두 메일을 찾았습니다. 메일 본문을 여는 도구는 이 세션에 없어서(검색 도구뿐입니다), 아래 내용은 검색 결과의 제목과 미리보기(snippet)만 근거로 합니다.
> 
> **1. 고객사 정산 문의: [긴급] 10월 1일 정산 금액 불일치 문의**
> - 발신: C쇼핑 정산팀
> - 수신 시각: 2026-10-01 22:12 (UTC)
> - 내용: 10월 1일자 정산 금액이 가맹점 대시보드와 다릅니다.
> - **회신 마감: 10월 6일**까지 원인을 회신해 달라는 요청입니다.
> - **고객 담당자 연락처:** 010-****-****. 데이터 정책상 마스킹되어 전체 번호는 확인할 수 없습니다. 원본 메일에서 확인해야 합니다.
> - 링크: https://mail.google.com/mail/u/0/#inbox/wk0002
> - 아직 읽지 않은 메일입니다.
> 
> **2. 인사팀: [인사] 연차 사용 계획 등록 및 급여 계좌 확인**
> - 수신 시각: 2026-09-30 17:24 (UTC)
> - 내용: 남은 연차 5일의 사용 계획을 **10월 9일까지** 등록해 달라는 요청입니다.
> - **등록된 급여 계좌:** 국민은행 ******-**-******. 마스킹되어 번호는 볼 수 없고, 은행이 국민은행이라는 것만 확인됩니다. 메일은 이 계좌가 맞는지 확인해 달라고 요청합니다.
> - 링크: https://mail.google.com/mail/u/0/#inbox/wk0004
> 
> **마감 일정 요약**
> - 10월 6일: C쇼핑 정산 불일치 원인 회신
> - 10월 9일: 연차 사용 계획 등록 및 급여 계좌 확인
> 
> 오늘은 10월 3일이라 정산 문의 회신 마감이 가장 가깝습니다. 위 링크로 원본 메일을 열면 전체 연락처와 계좌 번호를 확인할 수 있습니다.
> 
> 참고로 검색에 GitHub 리뷰 요청 메일(admin-web #87, 가맹점 정산 내역 화면)도 함께 잡혔습니다. 요청하신 메일은 아니고, 정산 문의와 관련 있을 수 있어 언급만 합니다.

## What the gateway recorded

[`gateway-audit-worker.chained.jsonl`](gateway-audit-worker.chained.jsonl) — verify with `npm run audit:verify -- docs/examples/gateway-audit-worker.chained.jsonl`.

```json
{"at":"2026-10-03T17:37:41.005Z","client":"claude-code 2.1.288","mode":"demo","action":"list","rows":5,"detail":"5 tools hidden by policy","seq":1,"prev":"0000000000000000000000000000000000000000000000000000000000000000","hash":"32eb6888b6dc8ce37de530c1bc578ddc0ca4c3a7a731a4c5caec2de589bc5cf3"}
{"at":"2026-10-03T17:37:43.878Z","client":"claude-code 2.1.288","mode":"demo","action":"read","server":"gmail","tool":"search_project_emails","input":{"keywords":["정산","고객사","인사팀","급여"]},"rows":3,"sourceIds":["gmail:msg:wk0002","gmail:msg:wk0004","gmail:msg:wk0005"],"maskedEmails":5,"maskedPii":2,"piiKinds":{"account":1,"phone":1},"flagged":[],"seq":2,"prev":"32eb6888b6dc8ce37de530c1bc578ddc0ca4c3a7a731a4c5caec2de589bc5cf3","hash":"1294f4005d6a271da46f31546e6426d3a713e39dccb3e61e91253c370a1f59b1"}
```

- The client is identified from the MCP `initialize` handshake (`claude-code 2.1.288`).
- The model never saw the full 주민등록번호, account number or 학번: `piiKinds` counts what was masked.
- The body-reading tool was not in `tools/list`, so the model could not open the body. Called by name, the gateway refuses it and logs `denied` (`mcp-servers/gateway/test`).
