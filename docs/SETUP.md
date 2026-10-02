# Setup — Real Mode

Demo Mode needs nothing. Real Mode needs an LLM key and/or OAuth apps.

## 1. LLM

```
LLM_PROVIDER=anthropic          # default
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-opus-5-5       # optional override
```

OpenAI: `LLM_PROVIDER=openai`, `LLM_API_KEY=sk-...`, `LLM_MODEL=gpt-4.1`.
OpenAI-compatible (Ollama, vLLM, LM Studio): `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=llama3.1`.

Without `LLM_API_KEY` the scripted provider is used and the UI says so.

## 2. GitHub OAuth App

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Homepage URL: `http://localhost:5173`. Authorization callback URL: `http://localhost:3001/auth/github/callback`.
3. Put the client id and secret into `.env` as `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

Scopes requested: `read:user`, `repo` (needed to read private repository activity; only read endpoints are called).

## 3. Google OAuth client (Gmail + Calendar)

1. Google Cloud Console → APIs & Services → enable **Gmail API** and **Google Calendar API**.
2. OAuth consent screen → External → add yourself as a test user (sensitive scopes work in Testing mode without verification).
3. Credentials → Create OAuth client ID → Web application → Authorized redirect URI: `http://localhost:3001/auth/google/callback`.
4. Put the client id and secret into `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Scopes requested: `gmail.readonly`, `calendar.readonly`, `openid`, `email`.

## 4. Token encryption

```
openssl rand -hex 32   # → SESSION_ENCRYPTION_KEY
```

Without it tokens live in memory only and vanish on restart (status shows `tokenStore.persistent: false`).

## 5. Connect

`npm run dev`, open http://localhost:5173, click **Connect GitHub** / **Connect Google** in the Integrations panel, switch the mode toggle to **REAL**, run.

Real runs spawn only the connected servers. `GET http://localhost:3001/api/status` shows exactly what a real run would use.

## Running an MCP server standalone

```bash
npm run build
GITHUB_TOKEN=ghp_... node mcp-servers/github/dist/index.js --mode=real
node mcp-servers/gmail/dist/index.js --mode=demo
```

Any MCP host that speaks stdio can attach to these commands.
