# Codex Responses Translator

本项目是 Codex CLI 的本地协议转换层，把 Codex 使用的 OpenAI Responses API 转成更通用的 OpenAI-compatible Chat Completions API。

```text
Codex CLI
  -> http://127.0.0.1:3002/v1/responses
  -> translator
  -> https://openclawroot.com/v1/chat/completions
```

项目路径：`/data/translator`  
GitHub：`https://github.com/xiao-fengyu/translator`

## Current Status

当前阶段：可用原型 / 稳态化收尾。

已验证能力：

- Codex 基础聊天可用。
- Codex 可通过 translator 调用 shell 工具。
- Codex 可读代码、改文件、运行测试。
- Responses `tools` / `tool_choice` 可转为 Chat Completions `tools` / `tool_choice`。
- Chat Completions `tool_calls` 可转回 Responses `function_call`。
- 流式 tool-call delta 可转为 Responses `response.function_call_arguments.*` 事件。
- translator 已由 systemd 接管并开机自启。

当前服务：

```text
codex-translator.service: enabled / active
listen: 127.0.0.1:3002
upstream: https://openclawroot.com/v1
model: claude-opus-4-7
```

NewAPI 当前仍保留在本机，但 Codex 主链路已经不经过 NewAPI。

## Repository Layout

```text
/data/translator/
├── README.md
├── package.json
├── .env.example
├── .gitignore
├── deploy/
│   └── codex-translator.service
├── scripts/
│   ├── healthcheck.sh
│   ├── start.sh
│   ├── stop.sh
│   └── test-codex.sh
├── src/
│   ├── config.ts
│   ├── index.ts
│   ├── translators/
│   │   ├── chat-to-responses.ts
│   │   ├── responses-to-chat.ts
│   │   └── stream-events.ts
│   ├── types/
│   │   ├── chat.ts
│   │   └── responses.ts
│   └── upstream/
│       └── openai-compatible.ts
└── tests/
    ├── chat-to-responses.test.ts
    ├── responses-to-chat.test.ts
    └── stream-events.test.ts
```

## Configuration

Create local config from the example:

```bash
cd /data/translator
cp .env.example .env
chmod 600 .env
```

Example fields:

```bash
TRANSLATOR_HOST=127.0.0.1
TRANSLATOR_PORT=3002
UPSTREAM_BASE_URL=https://openclawroot.com/v1
UPSTREAM_API_KEY=replace-me
TRANSLATOR_MODELS=claude-opus-4-7,gpt-5.5,qwen3.6-plus,gemini-2.5-flash
DEFAULT_MODEL=claude-opus-4-7
UPSTREAM_TIMEOUT_MS=120000
```

Important:

- `.env` contains secrets and must never be committed.
- `.env.example` is safe to commit and contains placeholders only.
- `UPSTREAM_BASE_URL` must be the OpenAI-compatible base URL ending in `/v1`.

## Codex Configuration

`~/.codex/config.toml` should point Codex at translator:

```toml
model = "claude-opus-4-7"
model_provider = "translator"

[model_providers.translator]
name = "Local Responses Translator"
base_url = "http://127.0.0.1:3002/v1"
wire_api = "responses"
```

Keep the old provider block if you want a quick rollback path.

## Run With Systemd

The active deployment uses systemd:

```bash
systemctl status codex-translator.service
systemctl restart codex-translator.service
systemctl enable codex-translator.service
```

Service file on host:

```text
/etc/systemd/system/codex-translator.service
```

Repository copy:

```text
deploy/codex-translator.service
```

Install or refresh service file:

```bash
cp /data/translator/deploy/codex-translator.service /etc/systemd/system/codex-translator.service
systemctl daemon-reload
systemctl enable codex-translator.service
systemctl restart codex-translator.service
```

## Manual Run

For local manual debugging only:

```bash
cd /data/translator
npm start
```

Helper scripts:

```bash
./scripts/start.sh
./scripts/stop.sh
```

Do not run manual and systemd instances at the same time on port `3002`.

## Health Check

```bash
npm run healthcheck
```

Expected output:

```text
translator healthy: codex-responses-translator 0.1.0
```

Direct HTTP check:

```bash
curl http://127.0.0.1:3002/healthz
```

Expected JSON:

```json
{"ok":true,"service":"codex-responses-translator","version":"0.1.0"}
```

Override health URL when needed:

```bash
TRANSLATOR_HEALTH_URL=http://127.0.0.1:3002/healthz npm run healthcheck
```

## Validation

Run all local gates:

```bash
npm run check
npm test
npm run healthcheck
```

Codex smoke test:

```bash
codex exec --ephemeral --skip-git-repo-check -C /data/workspace 'Reply exactly: pong'
```

Codex tool-call smoke test:

```bash
codex exec --sandbox workspace-write --skip-git-repo-check -C /data/translator \
  'Create a file named .codex-tool-test.txt in the current directory with exactly the text TOOL_OK. Do not modify any other files.'
```

Clean up after the tool-call smoke test:

```bash
rm -f /data/translator/.codex-tool-test.txt
```

## Supported API Surface

Implemented routes:

- `GET /healthz`
- `GET /v1/models`
- `POST /v1/responses`
- `POST /v1/responses/compact`
- `POST /v1/chat/completions` pass-through

Implemented translation:

- Responses text input to Chat Completions messages.
- Responses `instructions` to system message.
- Responses `tools` / `tool_choice` to Chat Completions tools.
- Responses `function_call` history to Chat Completions assistant `tool_calls`.
- Responses `function_call_output` to Chat Completions tool messages.
- Minimal in-memory `previous_response_id` reuse for recent non-streaming conversations in the same translator process.
- Disk-persisted `previous_response_id` context store: recent non-streaming conversations survive translator restarts (per-response JSON files in `data/context/`, capped at 200 entries with LRU index).
- Arbitrary historical `previous_response_id` lookup: any previously saved response can be referenced by ID; aging trims oldest entries past the cap.
- Multimodal input: Responses `input_image` content parts are converted to Chat Completions `image_url` multimodal messages (supports both URL and base64 data URIs).
- Chat Completions text to Responses `message` / `output_text`.
- Chat Completions `tool_calls` to Responses `function_call` output items.
- Streaming text deltas to Responses SSE text events.
- Streaming tool-call argument deltas to Responses SSE function-call events.
- Streaming failures are normalized into structured `response.failed` error objects for malformed upstream events, interrupted streams, and timeout-like aborts.
- Non-streaming upstream errors are normalized into stable translator error objects for `401/403/404/408/429/5xx`.
- Upstream timeout, connection failure, invalid request JSON, and invalid upstream JSON are mapped to explicit error codes.

Known limitations:

- `/v1/responses/compact` is implemented as a minimal compatibility shape, not full OpenAI compaction semantics.
- Image input is now supported for `input_image` content parts with URL or base64 data URI.
- Full conversation store semantics (`store: true`, cross-process querying beyond this translator instance) are not implemented.
- Context store is local to this translator — different translator instances on other machines cannot share it.
- `previous_response_id` disk store only preserves recent non-streaming responses within a capped local JSON file; it is not a full history database.
- Streaming mid-flight failures are now structured, but still do not preserve raw upstream event ordering/state for full forensic replay.

## Troubleshooting

Check service:

```bash
systemctl --no-pager --full status codex-translator.service
```

Read logs:

```bash
journalctl -u codex-translator.service -n 100 --no-pager
journalctl -u codex-translator.service -f
```

Check port:

```bash
ss -ltnp | grep ':3002'
```

Check Codex provider:

```bash
grep -E '^(model|model_provider) =|\[model_providers\.translator\]|base_url = "http://127.0.0.1:3002' ~/.codex/config.toml
```

Run Codex diagnostics:

```bash
codex doctor --summary
```

Common symptoms:

- `429 Too Many Requests`: upstream model/channel rate limit; wait or switch model.
- `connection refused 127.0.0.1:3002`: translator service is down or port conflict exists.
- Codex chats but will not edit files: tool-call translation is broken or service is running old code; restart `codex-translator.service` and rerun tests.
- Secret printed in logs: rotate upstream key and inspect `.env`; do not commit runtime logs.

## Rollback

Rollback Codex to old NewAPI provider if needed:

1. Edit `~/.codex/config.toml`.
2. Change:

```toml
model_provider = "newapi"
```

3. Ensure the old provider block exists:

```toml
[model_providers.newapi]
name = "NewAPI"
base_url = "http://127.0.0.1:3000/v1"
wire_api = "responses"
```

4. Verify:

```bash
codex doctor --summary
codex exec --ephemeral --skip-git-repo-check -C /data/workspace 'Reply exactly: pong'
```

Rollback translator code:

```bash
cd /data/translator
git log --oneline
git checkout <known-good-commit>
systemctl restart codex-translator.service
npm run healthcheck
```

Do not delete NewAPI until translator has been stable long enough and the user explicitly confirms. If NewAPI is ever stopped, back up first:

```bash
tar -czf /data/docker/new-api-backup-$(date +%Y%m%d-%H%M%S).tar.gz /data/docker/new-api
```

## Git Workflow

Remote:

```text
git@github.com:xiao-fengyu/translator.git
```

Push current branch to GitHub `main`:

```bash
git push origin HEAD:main
```

Ignored runtime files:

- `.env`
- `.env.backup*`
- `translator.log`
- `translator.pid`

## Milestones

- `f27832f` — Initial translator MVP.
- `34edb16` — Codex config switched to translator.
- `2669a4c` — Translator switched to direct upstream.
- `7f66e82` — systemd service added.
- `c9ed05f` — healthcheck script added.
- `92b3efa` — Responses tool-call compatibility added.
- `8a0a5d9` — Mixed content + tool-call test added by Codex.
- `b9d0e07` — Streamed tool-call event test added by Codex.
- `current` — Non-streaming error mapping hardened for upstream HTTP, timeout, connection, and JSON failures.
- `current` — Added minimal `POST /v1/responses/compact` compatibility route.
- `current` — Hardened streaming `response.failed` events with structured codes for malformed chunks, interruptions, and timeouts.
- `current` — Added minimal in-memory `previous_response_id` conversation reuse for recent non-streaming requests.
- `current` — Upgraded `previous_response_id` to a disk-backed JSON store; context survives translator restarts (capped at 200 entries, stored in `data/response-contexts.json`).
- `current` — Added multimodal input support: `input_image` content parts with URL or base64 data URI are converted to Chat Completions `image_url` multimodal messages.
- `current` — Upgraded context store to per-response file format (`data/context/<id>.json`) with LRU index; arbitrary `previous_response_id` lookup across process restarts.

## Operational Rules

- Do not restart OpenClaw Gateway for this project unless the user explicitly asks.
- Do not stop or delete NewAPI without a separate confirmation and backup.
- Do not print or commit API keys.
- Prefer small changes followed by `npm run check`, `npm test`, and `npm run healthcheck`.
