# Claude Code through the MCP policy gateway (recorded run)

Recorded 2026-10-03 with `npm run record:gateway-run`. **Data is the synthetic demo workspace** (`--mode=demo`); the model was Claude Code CLI (claude-sonnet-5-5).

```sh
claude -p --mcp-config mcp.json --strict-mcp-config --allowedTools "mcp__mawa__*" "mawa MCP 도구로 고객사 정산 문의 메일과 인사팀 메일을 찾아서, 회신 마감과 고객 담당자 연락처, 등록된 급여 계좌를 알려줘. 가능하면 메일 본문도 열어봐."
```

`mcp.json` starts `mcp-servers/gateway/dist/index.js --mode=demo --policy=mcp-servers/gateway/policy.example.json --audit=audit.jsonl`. The policy allows 7 read tools; `gmail__get_email` (full mail body) is not among them.

## What Claude Code answered

> 두 메일을 찾았습니다. 다만 사용할 수 있는 MCP 도구는 메일 검색뿐이라 본문은 열지 못했습니다. 아래는 검색 결과의 요약(snippet)에서 가져온 내용입니다.
> 
> **1. 고객사 정산 문의: C쇼핑 정산팀**
> - 제목: [긴급] 10월 1일 정산 금액 불일치 문의 (수신 2026-10-01)
> - 내용: 10월 1일자 정산 금액이 가맹점 대시보드와 다르다는 문의입니다.
> - **회신 마감: 2026-10-06** (오늘 10월 3일 기준 3일 남음). 원인을 회신해 달라는 요청입니다.
> - **담당자 연락처:** 010-****-****. 보안 정책상 마스킹되어 뒷자리는 확인할 수 없습니다.
> - 발신 주소도 `s***@c-shop.example.com`으로 마스킹되어 있습니다.
> - 원문: https://mail.google.com/mail/u/0/#inbox/wk0002
> 
> **2. 인사팀: 연차 사용 계획 등록 및 급여 계좌 확인**
> - 수신: 2026-09-30
> - 내용: 남은 연차 5일의 사용 계획을 **10월 9일까지** 등록해야 합니다.
> - **등록된 급여 계좌:** 국민은행 ******-**-******. 계좌번호는 마스킹되어 있고, 메일은 이 계좌가 맞는지 확인해 달라고 요청합니다.
> - 원문: https://mail.google.com/mail/u/0/#inbox/wk0004
> 
> **참고**
> - 전체 연락처와 계좌번호는 이 도구로는 볼 수 없습니다. Gmail에서 위 링크로 원문을 직접 확인해 주세요.
> - 정산 문의 검색에서 GitHub 리뷰 요청 알림(#87, 가맹점 정산 내역 화면)도 함께 나왔습니다. 문의 메일과는 별개의 알림이라 위 정리에서는 뺐습니다.

## What the gateway recorded

[`gateway-audit-worker.chained.jsonl`](gateway-audit-worker.chained.jsonl) — verify with `npm run audit:verify -- docs/examples/gateway-audit-worker.chained.jsonl`.

```json
{"at":"2026-10-03T18:19:58.107Z","client":"claude-code 2.1.288","mode":"demo","action":"list","rows":5,"detail":"5 tools hidden by policy","seq":1,"prev":"0000000000000000000000000000000000000000000000000000000000000000","hash":"e4608345f10bc729f854fff574199dfaaaa6b4ccd73436940f70fa1afccebdb1","sig":"tzdelTD1RZCLDjdej+R9e8Ln64AiAJrTWzUaComPc6WBoz1wuN18skOVE44Pj8/cz1cv+CZEg7lcbrSHNI0iDw=="}
{"at":"2026-10-03T18:20:00.593Z","client":"claude-code 2.1.288","mode":"demo","action":"read","server":"gmail","tool":"search_project_emails","input":{"keywords":["정산","고객사"]},"rows":2,"sourceIds":["gmail:msg:wk0002","gmail:msg:wk0005"],"maskedEmails":3,"maskedPii":1,"piiKinds":{"phone":1},"flagged":[],"seq":2,"prev":"e4608345f10bc729f854fff574199dfaaaa6b4ccd73436940f70fa1afccebdb1","hash":"80332246f19cdd4baba7f193ed9d0bc8e7885fc74a29e7ac61837cce17497bd8","sig":"xoz/RgsykCTywY0Kfo10DgeAuayCLN14PUnlVYeuXMN5ybe+soCtCnViUfjvlGJ4tfCj7+hu21AFSyLhaepCBw=="}
{"at":"2026-10-03T18:20:00.786Z","client":"claude-code 2.1.288","mode":"demo","action":"read","server":"gmail","tool":"search_project_emails","input":{"keywords":["인사팀","급여"]},"rows":1,"sourceIds":["gmail:msg:wk0004"],"maskedEmails":2,"maskedPii":1,"piiKinds":{"account":1},"flagged":[],"seq":3,"prev":"80332246f19cdd4baba7f193ed9d0bc8e7885fc74a29e7ac61837cce17497bd8","hash":"964f15fd6b86a3c02d255005375b17c7fdb73f53c83d71236fc34099a0116c18","sig":"d87av1tL7jNKLlC7ftP17RtyLqTTX5u518/RfEAt8RoIQbWZNzyPTvMrzEVC8P0ZxNy2umrspKdix9REH765BQ=="}
```

- The client is identified from the MCP `initialize` handshake (`claude-code 2.1.288`).
- The model never saw the full 주민등록번호, account number or 학번: `piiKinds` counts what was masked.
- The body-reading tool was not in `tools/list`, so the model could not open the body. Called by name, the gateway refuses it and logs `denied` (`mcp-servers/gateway/test`).
