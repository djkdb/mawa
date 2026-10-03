# Claude Code through the MCP policy gateway (recorded run)

Recorded 2026-10-03 with `npm run record:gateway-run`. **Data is the synthetic demo workspace** (`--mode=demo`); the model was Claude Code CLI (claude-sonnet-5-5).

```sh
claude -p --mcp-config mcp.json --strict-mcp-config --allowedTools "mcp__mawa__*" "mawa MCP 도구로 장학금 관련 메일을 찾아서, 학교에 등록된 내 정보와 마감일을 알려줘. 가능하면 그 메일 본문도 열어봐."
```

`mcp.json` starts `mcp-servers/gateway/dist/index.js --mode=demo --policy=mcp-servers/gateway/policy.example.json --audit=audit.jsonl`. The policy allows 7 read tools; `gmail__get_email` (full mail body) is not among them.

## What Claude Code answered

> 장학금 관련 메일 2건을 찾았습니다. 다만 사용 가능한 MCP 도구는 제목, 발신자, 요약(snippet)만 돌려주고 본문 전체를 여는 기능이 없어서 본문은 열지 못했습니다. 아래 내용은 모두 snippet에서 가져온 것입니다. 개인정보는 도구가 마스킹해서 돌려줬습니다.
> 
> **1. [소프트웨어학부] 2026-2 교내 장학금 신청 안내** (9/30 수신)
> - 학번 20********(뒷자리 마스킹)로 신청 대상자라고 안내합니다.
> - 신청 기간은 10월 1일부터 10월 9일까지입니다. 학생 포털에서 신청합니다.
> - 마감일은 **10월 9일(금)** 입니다.
> 
> **2. [학생지원팀] 장학금 지급 정보 확인 요청** (10/2 수신, 아직 안 읽음)
> - 학교에 등록된 정보는 주민등록번호 040512-*******과 지급 계좌 농협 ***-****-****-**입니다.
> - 틀린 내용이 있으면 **10월 9일까지** 학생 포털에서 고쳐야 합니다.
> 
> **정리**
> - 두 건 모두 마감이 **10월 9일**입니다. 오늘이 10월 3일이니 6일 남았습니다.
> - 할 일은 두 가지입니다. 학생 포털에서 장학금을 신청하고, 등록된 주민번호와 계좌가 맞는지 확인합니다.
> - 두 번째 메일은 주민번호와 계좌 정보를 보여 주면서 수정을 요청하는 내용입니다. 메일 링크로 들어가지 말고, 학교 포털에 직접 접속해서 확인하는 쪽이 안전합니다.
> - 본문 전체는 Gmail에서 직접 볼 수 있습니다.
>   - 장학금 안내: https://mail.google.com/mail/u/0/#inbox/demo0006
>   - 지급 정보 확인: https://mail.google.com/mail/u/0/#inbox/demo0012
> 
> **참고: 같은 기간의 LMS 마감**
> - 10/5 운영체제 과제2
> - 10/8 데이터베이스시스템 퀴즈2
> - 10/12 컴퓨터네트워크 실습 보고서 3
> - 10/13 캡스톤디자인 중간발표 슬라이드

## What the gateway recorded

[`gateway-audit.chained.jsonl`](gateway-audit.chained.jsonl) — verify with `npm run audit:verify -- docs/examples/gateway-audit.chained.jsonl`.

```json
{"at":"2026-10-03T18:19:44.626Z","client":"claude-code 2.1.288","mode":"demo","action":"list","rows":7,"detail":"6 tools hidden by policy","seq":1,"prev":"0000000000000000000000000000000000000000000000000000000000000000","hash":"0611f707ed49eba0f682ffc31444f833a45acb40ee384e847ecf72382db9e05b","sig":"tpeCEVG+8nSaG8/zOnZGO9rnDJgfzhhy7ZDKNatpv+yfIO7ZJcixv2MW6O+dSXxdOLpDUAysGprgJCHKbZWLBw=="}
{"at":"2026-10-03T18:19:47.021Z","client":"claude-code 2.1.288","mode":"demo","action":"read","server":"gmail","tool":"search_project_emails","input":{"keywords":["장학금","scholarship"]},"rows":2,"sourceIds":["gmail:msg:demo0006","gmail:msg:demo0012"],"maskedEmails":4,"maskedPii":3,"piiKinds":{"rrn":1,"account":1,"studentNo":1},"flagged":[],"seq":2,"prev":"0611f707ed49eba0f682ffc31444f833a45acb40ee384e847ecf72382db9e05b","hash":"cae7cfd7b5564ee1e99ea8443f7025d5f549d8693b5a0edef84e617932f730f3","sig":"5e0eT1nBQKlx2RlOJz/qhjJj0BUamFAdBZqknWyWd8NS3K3qneP3xcvVFRlBSPzX7pBjvwVjLRkq18prmYA+Bg=="}
{"at":"2026-10-03T18:19:47.185Z","client":"claude-code 2.1.288","mode":"demo","action":"read","server":"lms","tool":"get_upcoming_deadlines","input":{"days":60},"rows":4,"sourceIds":["lms:due:9001","lms:due:9002","lms:due:9003","lms:due:9004"],"maskedEmails":0,"maskedPii":0,"piiKinds":{},"flagged":[],"seq":3,"prev":"cae7cfd7b5564ee1e99ea8443f7025d5f549d8693b5a0edef84e617932f730f3","hash":"09afebd024309aa9ed66297d5b8eccc7f2d759973c7574729d6d5f5059975362","sig":"YVJ/oC66OCUr4X8TrZhSaX4yowAQhivfMOqkZk03A/0JsEiLk+SGB6VQDMvd6Dahpmvwe2hqwKNxPBNRXPAMDQ=="}
```

- The client is identified from the MCP `initialize` handshake (`claude-code 2.1.288`).
- The model never saw the full 주민등록번호, account number or 학번: `piiKinds` counts what was masked.
- The body-reading tool was not in `tools/list`, so the model could not open the body. Called by name, the gateway refuses it and logs `denied` (`mcp-servers/gateway/test`).
