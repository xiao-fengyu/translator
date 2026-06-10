# Codex Responses Translator

本项目路径：`/data/translator`

## 约束

本项目按用户要求套用 `/data/e-platform` 同级别工作约束：

1. 先写计划书，确认后执行。
2. 严格按计划执行，变更路线必须先说明并确认。
3. 不擅自重启 OpenClaw Gateway。
4. 每次任务后更新本 README。
5. 一次只处理一个问题。
6. 目前没有 GitHub 仓库：暂时不 push；保留本地 git commit，后续用户提供仓库后再配置 remote 并推送。
7. NewAPI 卸载/删除属于破坏性操作：translator 跑通并单独确认替换阶段前，不删除 NewAPI 数据。

## 目标

Codex CLI 新版本主要使用 OpenAI Responses API：

```text
POST /v1/responses
```

但部分上游模型/中转，尤其 Claude 兼容模型，更稳定支持：

```text
POST /v1/chat/completions
```

本项目提供本地协议翻译层：

```text
Codex CLI
  -> /v1/responses
  -> translator
  -> /v1/chat/completions
  -> upstream OpenAI-compatible API
```

## 当前阶段

阶段：MVP 实现中。

当前优先实现：

- `GET /healthz`
- `GET /v1/models`
- `POST /v1/responses`：Responses 请求转 Chat Completions 请求
- Chat Completions 响应包装回 Responses-like JSON
- `POST /v1/chat/completions`：透传上游，便于测试
- 基础非流式与流式响应

暂不承诺完整支持：

- tool calls
- image / multimodal input
- `/v1/responses/compact`
- conversation store
- Codex 全量 Responses 事件语义

## 目录规划

```text
/data/translator/
├── README.md
├── package.json
├── .env.example
├── .gitignore
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── routes/
│   │   ├── responses.ts
│   │   ├── models.ts
│   │   └── health.ts
│   ├── translators/
│   │   ├── responses-to-chat.ts
│   │   ├── chat-to-responses.ts
│   │   └── stream-events.ts
│   ├── upstream/
│   │   └── openai-compatible.ts
│   └── types/
│       ├── responses.ts
│       └── chat.ts
├── scripts/
│   ├── start.sh
│   ├── stop.sh
│   └── test-codex.sh
└── tests/
    ├── responses-to-chat.test.ts
    └── chat-to-responses.test.ts
```

## 配置

复制环境变量模板：

```bash
cd /data/translator
cp .env.example .env
chmod 600 .env
```

关键配置：

```bash
TRANSLATOR_HOST=127.0.0.1
TRANSLATOR_PORT=3002
UPSTREAM_BASE_URL=http://127.0.0.1:3000/v1
UPSTREAM_API_KEY=replace-me
TRANSLATOR_MODELS=claude-opus-4-7,gpt-5.5,qwen3.6-plus,gemini-2.5-flash
DEFAULT_MODEL=claude-opus-4-7
```

迁移期可以先让 translator 继续调用本机 NewAPI：

```text
UPSTREAM_BASE_URL=http://127.0.0.1:3000/v1
```

等 translator 验证通过，再进入替换 NewAPI 阶段。

## 启动

```bash
cd /data/translator
npm start
```

或：

```bash
./scripts/start.sh
```

## 健康检查

```bash
curl http://127.0.0.1:3002/healthz
```

## Codex 配置示例

后续可将 `~/.codex/config.toml` 指向 translator：

```toml
model = "claude-opus-4-7"
model_provider = "translator"

[model_providers.translator]
name = "Local Responses Translator"
base_url = "http://127.0.0.1:3002/v1"
wire_api = "responses"
```

## NewAPI 替换计划

安全顺序：

1. translator 在 `127.0.0.1:3002` 跑通。
2. Codex 指向 translator 并通过 `codex exec ping`。
3. 备份 `/data/docker/new-api`。
4. 停止 NewAPI 容器，但不删除数据。
5. 将 translator 调整到目标端口。
6. 用户再次确认后，才删除 NewAPI 容器/数据。

## 变更记录

- 2026-06-10：用户确认按计划执行；补充说明本项目暂时无 GitHub 仓库，不 push，只保留本地 commit。
- 2026-06-10：初始化项目规划和 README。

## 2026-06-10 MVP 验证结果

### 已完成

- 初始化 `/data/translator` 项目目录。
- 写入 README、环境变量模板、启动/停止脚本。
- 实现 Node.js 轻量 HTTP 服务，无外部 npm 依赖。
- 实现：
  - `GET /healthz`
  - `GET /v1/models`
  - `POST /v1/chat/completions` 上游透传
  - `POST /v1/responses` 非流式转换
  - `POST /v1/responses` 流式 SSE 转换
- 新增单元测试：
  - Responses 请求转 Chat Completions 请求
  - Chat Completions 响应包装为 Responses-like 响应

### 验证命令与结果

语法检查：

```bash
node --check src/index.ts
```

单元测试：

```bash
npm test
```

结果：`5/5 pass`。

HTTP 健康检查：

```bash
curl http://127.0.0.1:3002/healthz
```

结果：正常返回 `ok: true`。

非流式 Responses 验证：

```bash
curl http://127.0.0.1:3002/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"claude-opus-4-7","instructions":"Reply with exactly pong.","input":"ping","stream":false}'
```

结果：`output_text = "pong"`。

流式 Responses 验证：

```bash
curl -N http://127.0.0.1:3002/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"claude-opus-4-7","instructions":"Reply exactly pong.","input":"ping","stream":true}'
```

结果：正常发出 `response.created`、`response.output_text.delta`、`response.completed` 等事件。

Codex CLI 临时配置验证：

```bash
CODEX_HOME=<temporary-home> codex exec --ephemeral --skip-git-repo-check -C /data/workspace 'Reply exactly: pong'
```

结果：Codex 通过 translator 使用 `claude-opus-4-7` 正常返回 `pong`。

### 当前运行状态

translator 当前运行在：

```text
http://127.0.0.1:3002
```

当前上游仍临时指向本机 NewAPI：

```text
http://127.0.0.1:3000/v1
```

这意味着：

- translator 的协议转换已经跑通；
- NewAPI 暂时仍作为上游 API/key 管理层存在；
- 尚未进入“停用/卸载 NewAPI”阶段。

### 下一步

下一步建议单独确认后执行：

1. 将 Codex 正式配置切到 translator。
2. 如果要彻底替代 NewAPI，则需要把 translator 的 `UPSTREAM_BASE_URL` 和 `UPSTREAM_API_KEY` 改为真实上游，而不是本机 NewAPI。
3. 验证真实上游直连成功。
4. 备份 `/data/docker/new-api`。
5. 停止 NewAPI 容器。
6. 用户再次确认后，才删除 NewAPI 容器或数据。

## 2026-06-10 Codex 正式切换到 translator

### 操作

用户确认开始第二阶段后，已将正式 Codex 配置从 `newapi` provider 切换到 `translator` provider。

备份文件：

```text
/root/.codex/config.toml.backup-translator-20260610-130156
```

当前关键配置：

```toml
model = "claude-opus-4-7"
model_provider = "translator"

[model_providers.translator]
name = "Local Responses Translator"
base_url = "http://127.0.0.1:3002/v1"
wire_api = "responses"
```

`newapi` provider block 暂时保留，便于回滚。

### 验证

正式配置下执行：

```bash
codex exec --ephemeral --skip-git-repo-check -C /data/workspace 'Reply exactly: pong'
```

结果：Codex 通过 `translator` provider 正常返回 `pong`。

执行：

```bash
codex doctor --summary
```

结果：

- `Configuration: config loaded`
- `Connectivity: active provider endpoints are reachable over HTTP`
- `websocket: Responses WebSocket is not enabled for the active provider`
- `0 fail`

### 当前边界

- 没有重启 OpenClaw Gateway。
- 没有停止或删除 NewAPI。
- translator 当前仍以 NewAPI 作为临时上游：`http://127.0.0.1:3000/v1`。
- 下一阶段如果要替代 NewAPI，需要先把 translator 的上游改为真实 OpenAI-compatible 服务并验证。

## 2026-06-10 translator 直连真实上游

### 操作

用户确认开始第三阶段后，已将 translator 的上游从本机 NewAPI 改为真实 OpenAI-compatible 上游。

当前 `/data/translator/.env` 关键配置：

```bash
UPSTREAM_BASE_URL=https://openclawroot.com/v1
TRANSLATOR_MODELS=qwen3.6-plus,claude-opus-4-7,gemini-2.5-flash,gpt-5.5
DEFAULT_MODEL=claude-opus-4-7
```

`UPSTREAM_API_KEY` 只保存在 `.env` 中，`.env` 已被 `.gitignore` 排除，不进入 git。

同时修正了 `scripts/stop.sh`，避免停止 translator 时遗留 orphan 的 `node src/index.ts` 子进程。

### 验证

真实上游直连探测：

```bash
POST https://openclawroot.com/v1/chat/completions
model=claude-opus-4-7
```

结果：HTTP 200，返回 `pong`。

translator 非流式验证：

```bash
POST http://127.0.0.1:3002/v1/responses
model=claude-opus-4-7
stream=false
```

结果：HTTP 200，`output_text = "pong"`。

translator 流式验证：

```bash
POST http://127.0.0.1:3002/v1/responses
model=claude-opus-4-7
stream=true
```

结果：正常输出 Responses SSE 事件：

- `response.created`
- `response.output_item.added`
- `response.content_part.added`
- `response.output_text.delta`
- `response.output_text.done`
- `response.content_part.done`
- `response.output_item.done`
- `response.completed`

Codex 正式配置验证：

```bash
codex exec --ephemeral --skip-git-repo-check -C /data/workspace 'Reply exactly: pong'
```

结果：Codex 通过 `translator` provider 正常返回 `pong`。

Codex Doctor：

```bash
codex doctor --summary
```

结果：

- `Configuration: config loaded`
- `Connectivity: active provider endpoints are reachable over HTTP`
- `0 fail`

### 当前链路

现在 Codex 实际链路已经变为：

```text
Codex CLI
  -> translator http://127.0.0.1:3002/v1/responses
  -> https://openclawroot.com/v1/chat/completions
```

NewAPI 当前仍在本机保留，但已经不在 Codex 的主调用链路里：

```text
NewAPI 127.0.0.1:3000：保留，未停止，未删除
```

### 下一步

下一步建议单独确认后执行：

1. 将 translator 做成 systemd 服务，开机自启。
2. 连续跑几个真实 Codex coding prompt，确认非 ping 场景稳定。
3. 稳定后再讨论是否停止 NewAPI。
4. 停止 NewAPI 前必须先备份 `/data/docker/new-api`，且需要用户再次明确确认。

## 2026-06-10 systemd 服务化

### 操作

已将 translator 从手动 `npm start` 进程切换为 systemd 服务：

```text
codex-translator.service
```

服务文件：

```text
/etc/systemd/system/codex-translator.service
```

仓库内同步保存了一份部署副本：

```text
deploy/codex-translator.service
```

启用命令已执行：

```bash
systemctl daemon-reload
systemctl enable codex-translator.service
systemctl restart codex-translator.service
```

### 当前服务状态

```text
Active: active (running)
Main PID: /usr/bin/node /data/translator/src/index.ts
Listen: 127.0.0.1:3002
```

健康检查：

```bash
curl http://127.0.0.1:3002/healthz
```

返回：

```json
{"ok":true,"service":"codex-responses-translator","version":"0.1.0"}
```

### 验证

单元测试：

```bash
npm test
```

结果：5/5 pass。

语法检查：

```bash
npm run check
```

结果：通过。

Codex 实测：

```bash
codex exec --ephemeral --skip-git-repo-check -C /data/workspace 'Reply exactly: pong'
```

结果：通过 translator 返回 `pong`。

Codex Doctor：

```text
Configuration: config loaded
Connectivity: active provider endpoints are reachable over HTTP
0 fail
```

### 边界

- 未重启 OpenClaw Gateway。
- 未停止或删除 NewAPI。
- 仅停止旧的手动 translator 进程，并由 systemd 接管同一服务。
- `.env` 仍然只保存在本机且被 gitignore。

## Health Check

Run the local translator health check with:

```bash
npm run healthcheck
```

The script calls `http://127.0.0.1:3002/healthz`, verifies HTTP 200, parses the JSON body, and fails if `ok !== true`.

You can override the URL when needed:

```bash
TRANSLATOR_HEALTH_URL=http://127.0.0.1:3002/healthz npm run healthcheck
```

## 2026-06-10 Codex coding stability test

A real Codex coding attempt was run against this repository after the translator became the active provider. Codex could start and respond through translator, but the first coding attempt stopped after printing intended shell commands instead of actually modifying files.

This is useful signal: chat/smoke tests pass, but full coding-agent behavior still needs better Responses/tool-call compatibility before relying on Codex for autonomous edits through this translator.

## 2026-06-10 Tool-call compatibility update

Translator now includes a minimal Responses tool-call compatibility layer:

- Responses `tools` / `tool_choice` are forwarded to Chat Completions `tools` / `tool_choice`.
- Chat Completions `tool_calls` are converted back to Responses `function_call` output items.
- Responses `function_call` history and `function_call_output` items are converted back to Chat Completions assistant/tool messages.
- Streaming Chat Completions tool-call deltas are mapped to Responses `response.function_call_arguments.*` events.

Validation:

```text
npm run check        ✅
npm test             ✅ 9/9
npm run healthcheck  ✅
```

A real Codex coding smoke test also passed after this update: Codex invoked shell through the translator and created a temporary `.codex-tool-test.txt` file with the expected content. The temporary file was removed and is not committed.
