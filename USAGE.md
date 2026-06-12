# Codex Responses Translator 使用文档

本文档面向日常使用和故障排查。项目路径：`/data/translator`。

## 1. 它是做什么的

translator 是 Codex CLI 的本地协议翻译层：

```text
Codex CLI
  -> http://127.0.0.1:3000/v1/responses
  -> translator
  -> https://openclawroot.com/v1/chat/completions
```

Codex 使用 OpenAI Responses API；上游使用 OpenAI-compatible Chat Completions API。translator 负责在两套协议之间转换。

## 2. 当前运行方式

当前推荐使用 systemd 托管：

```bash
systemctl status codex-translator.service
```

正常状态应类似：

```text
Active: active (running)
translator listening on http://127.0.0.1:3000
```

不要同时手动启动一份 translator，否则会占用同一个 `3000` 端口。

## 3. Codex 配置

Codex provider 应指向本地 translator：

```toml
model = "gpt-5.5"
model_provider = "translator"

[model_providers.translator]
name = "Local Responses Translator"
base_url = "http://127.0.0.1:3000/v1"
wire_api = "responses"
```

配置文件通常在：

```bash
~/.codex/config.toml
```

## 4. 常用命令

进入项目目录：

```bash
cd /data/translator
```

检查本地 translator 是否活着：

```bash
npm run healthcheck
```

检查 translator 到上游模型是否可用：

```bash
TRANSLATOR_DEEP_CHECK=1 npm run healthcheck
```

运行测试：

```bash
npm run check
npm test
```

查看服务状态：

```bash
systemctl status codex-translator.service
```

查看最近日志：

```bash
journalctl -u codex-translator.service -n 100 --no-pager
```

重启 translator 服务：

```bash
systemctl restart codex-translator.service
```

> 注意：这是重启 translator，不是 OpenClaw Gateway。

## 5. 手动启动/停止脚本

仅调试时使用：

```bash
./scripts/start.sh
./scripts/stop.sh
```

脚本行为：

- `start.sh` 会先检查 systemd 是否已托管。
- 如果 `3000` 端口已被 translator 占用，不会再重复启动。
- `stop.sh` 只会停止当前项目目录下的 translator 进程，避免误杀其他 Node 服务。

生产场景优先使用 systemd。

## 6. 环境变量

真实配置文件：

```bash
/data/translator/.env
```

模板文件：

```bash
/data/translator/.env.example
```

关键字段：

```bash
TRANSLATOR_HOST=127.0.0.1
TRANSLATOR_PORT=3000
UPSTREAM_BASE_URL=https://openclawroot.com/v1
UPSTREAM_API_KEY=replace-me
TRANSLATOR_MODELS=claude-opus-4-7,gpt-5.5,qwen3.6-plus,gemini-2.5-flash
DEFAULT_MODEL=claude-opus-4-7
UPSTREAM_TIMEOUT_MS=120000
UPSTREAM_RETRIES=2
UPSTREAM_RETRY_BASE_DELAY_MS=800
```

`.env` 包含密钥，不能提交到 GitHub。

## 7. 上游 503/超时如何处理

translator 已内置轻量重试：

- 会重试：`429`、`502`、`503`、`504`、连接失败、超时。
- 默认重试 2 次。
- 已开始输出的 SSE 流不会中途重放，避免重复工具调用。

如果 Codex 报上游不可用，先运行：

```bash
cd /data/translator
TRANSLATOR_DEEP_CHECK=1 npm run healthcheck
```

判断方式：

- 本地 healthcheck 通过、深度检查失败：多半是上游或网络问题。
- 本地 healthcheck 失败：优先查 translator 服务状态和日志。

## 8. Codex 全链路冒烟测试

```bash
codex exec --ephemeral --skip-git-repo-check -C /data/workspace 'Reply exactly: pong'
```

成功时应返回：

```text
pong
```

如果这里失败，但 `TRANSLATOR_DEEP_CHECK=1 npm run healthcheck` 成功，重点检查 Codex 配置是否仍指向 `http://127.0.0.1:3000/v1`。

## 9. 故障排查速查

### 9.1 端口被占用

现象：

```text
EADDRINUSE: address already in use 127.0.0.1:3000
```

处理：

```bash
ss -ltnp | grep ':3000'
systemctl status codex-translator.service
```

通常原因是 systemd 和手动进程同时启动。使用：

```bash
cd /data/translator
./scripts/stop.sh
./scripts/start.sh
```

### 9.2 systemd inactive

检查：

```bash
systemctl status codex-translator.service
journalctl -u codex-translator.service -n 100 --no-pager
```

启动：

```bash
systemctl start codex-translator.service
```

### 9.3 上游 503

检查：

```bash
cd /data/translator
TRANSLATOR_DEEP_CHECK=1 npm run healthcheck
```

如果偶发失败，通常等待后重试即可；translator 已经有 2 次轻量重试。

### 9.4 Codex 能启动但模型不通

检查 Codex provider：

```bash
grep -n "translator\|base_url\|wire_api\|model_provider" ~/.codex/config.toml
```

应确认：

```toml
base_url = "http://127.0.0.1:3000/v1"
wire_api = "responses"
```

## 10. 更新流程

修改代码后建议固定执行：

```bash
cd /data/translator
npm run check
npm test
npm run healthcheck
TRANSLATOR_DEEP_CHECK=1 npm run healthcheck
git status --short
```

确认无误后提交并推送：

```bash
git add -A
git commit -m "your change message"
git push origin HEAD:main
```
