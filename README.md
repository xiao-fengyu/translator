# Codex Responses Translator 归档说明

本项目是 Codex CLI 的本地协议翻译层，用来把 Codex 使用的 OpenAI Responses API 转换成更通用的 OpenAI-compatible Chat Completions API，方便接入不原生支持 Responses API 的上游模型。

```text
Codex CLI
  -> http://127.0.0.1:3000/v1/responses
  -> translator
  -> https://openclawroot.com/v1/chat/completions
```

- 本地路径：`/data/translator`
- GitHub：`https://github.com/xiao-fengyu/translator`
- 当前分支：本地 `master`，跟踪远端 `origin/main`
- 当前定位：可稳定运行的本地翻译服务，已完成核心协议兼容与运维收尾

## 一、当前状态

当前已确认：

- `codex-translator.service` 已由 systemd 托管。
- 服务监听 `127.0.0.1:3000`。
- 当前上游地址为 `https://openclawroot.com/v1`。
- 当前默认模型为 `claude-opus-4-7`。
- NewAPI 已退出 Codex 主链路，translator 已接管原 `3000` 端口。
- 本地 git 与远端 `origin/main` 在归档前保持同步。

当前服务形态：

```text
service: codex-translator.service
listen: 127.0.0.1:3000
upstream: https://openclawroot.com/v1
model: claude-opus-4-7
```

## 二、项目目标

本项目解决的问题是：Codex CLI 默认走 Responses API，而部分上游模型或代理只提供 Chat Completions API。translator 负责把请求和响应在两套协议之间做双向转换，同时尽量保持 Codex 的工具调用、流式输出、上下文续接等能力可用。

## 三、请求流与架构

### 1. 请求路径

```text
Codex CLI
  -> /v1/responses
  -> translator 路由层
  -> Responses → Chat Completions 转换
  -> 上游 /v1/chat/completions
  -> Chat Completions → Responses 转换
  -> 返回 Codex CLI
```

### 2. 核心组成

- `src/index.ts`：HTTP 服务入口与路由分发
- `src/config.ts`：环境变量读取与配置整理
- `src/errors.ts`：非流式错误映射
- `src/response-context-store.ts`：`previous_response_id` 本地持久化上下文存储
- `src/translators/responses-to-chat.ts`：Responses → Chat Completions
- `src/translators/chat-to-responses.ts`：Chat Completions → Responses
- `src/translators/compact-response.ts`：`/v1/responses/compact` 最小兼容处理
- `src/translators/stream-events.ts`：流式事件转换
- `src/translators/stream-errors.ts`：流式失败事件结构化
- `src/upstream/openai-compatible.ts`：上游 OpenAI-compatible 请求封装

## 四、目录归档

当前项目目录（省略 `.git`、运行缓存、依赖目录）：

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
│   ├── errors.ts
│   ├── index.ts
│   ├── response-context-store.ts
│   ├── translators/
│   │   ├── chat-to-responses.ts
│   │   ├── compact-response.ts
│   │   ├── responses-to-chat.ts
│   │   ├── stream-errors.ts
│   │   └── stream-events.ts
│   ├── types/
│   │   ├── chat.ts
│   │   └── responses.ts
│   └── upstream/
│       └── openai-compatible.ts
└── tests/
    ├── chat-to-responses.test.ts
    ├── compact-response.test.ts
    ├── errors.test.ts
    ├── responses-to-chat.test.ts
    └── stream-events.test.ts
```

说明：

- `.env` 属于本地敏感配置，不应提交。
- `translator.log` 属于运行日志，不应提交。
- 若存在本地上下文缓存目录或运行时文件，应继续由 `.gitignore` 管理。

## 五、配置说明

先复制环境变量模板：

```bash
cd /data/translator
cp .env.example .env
chmod 600 .env
```

示例字段：

```bash
TRANSLATOR_HOST=127.0.0.1
TRANSLATOR_PORT=3000
UPSTREAM_BASE_URL=https://openclawroot.com/v1
UPSTREAM_API_KEY=replace-me
TRANSLATOR_MODELS=claude-opus-4-7,gpt-5.5,qwen3.6-plus,gemini-2.5-flash
DEFAULT_MODEL=claude-opus-4-7
UPSTREAM_TIMEOUT_MS=120000
```

注意：

- `.env` 包含密钥，禁止提交到 GitHub。
- `.env.example` 只保留占位符，可提交。
- `UPSTREAM_BASE_URL` 应指向以 `/v1` 结尾的 OpenAI-compatible 根地址。

## 六、Codex 接入方式

`~/.codex/config.toml` 需要把 provider 指向 translator：

```toml
model = "claude-opus-4-7"
model_provider = "translator"

[model_providers.translator]
name = "Local Responses Translator"
base_url = "http://127.0.0.1:3000/v1"
wire_api = "responses"
```

如果需要保留回滚路径，可以暂时保留旧 provider 配置块，但当前主链路应指向 translator。

## 七、运行与部署

### 1. systemd 部署

查看状态：

```bash
systemctl status codex-translator.service
```

重启服务：

```bash
systemctl restart codex-translator.service
```

开机自启：

```bash
systemctl enable codex-translator.service
```

仓库内服务文件：

```text
deploy/codex-translator.service
```

安装或刷新服务文件：

服务文件是模板，需要先替换占位符。以部署到 `/data/translator` 为例：

```bash
sed -e 's|@PROJECT_ROOT@|/data/translator|g' \
    -e 's|@USER@|root|g' -e 's|@GROUP@|root|g' \
    deploy/codex-translator.service \
    | sudo tee /etc/systemd/system/codex-translator.service > /dev/null
systemctl daemon-reload
systemctl enable codex-translator.service
systemctl restart codex-translator.service
```

如果你把项目放在其他路径（例如 `/opt/translator`），只需替换第一行 sed 中的路径即可。

### 2. 手动运行

仅用于本地调试：

```bash
npm start
```

辅助脚本（已改为基于脚本自身目录推导路径，可 clone 到任意目录运行）：

```bash
./scripts/start.sh
./scripts/stop.sh
```

不要在 `3000` 端口上同时运行 systemd 实例和手动实例。

## 八、健康检查与验证

### 1. 基础健康检查

```bash
npm run healthcheck
```

直接请求：

```bash
curl http://127.0.0.1:3000/healthz
```

### 2. 本地校验命令

```bash
npm run check
npm test
npm run healthcheck
```

### 3. Codex 冒烟测试

基础对话：

```bash
codex exec --ephemeral --skip-git-repo-check -C /data/workspace 'Reply exactly: pong'
```

工具调用测试：

```bash
codex exec --sandbox workspace-write --skip-git-repo-check -C /data/translator \
  'Create a file named .codex-tool-test.txt in the current directory with exactly the text TOOL_OK. Do not modify any other files.'
```

测试后清理：

```bash
rm -f /data/translator/.codex-tool-test.txt
```

## 九、API 兼容范围

### 已实现路由

- `GET /healthz`
- `GET /v1/models`
- `POST /v1/responses`
- `POST /v1/responses/compact`
- `POST /v1/chat/completions`（透传，便于调试）

### 已实现能力

- Responses 文本输入转换为 Chat Completions messages
- `instructions` 转 system message
- `tools` / `tool_choice` 双向映射
- `function_call` 历史转 assistant `tool_calls`
- `function_call_output` 转 tool messages
- Chat Completions 文本转回 Responses `message` / `output_text`
- Chat Completions `tool_calls` 转回 Responses `function_call`
- 流式文本 delta 转 Responses SSE 事件
- 流式 tool-call argument delta 转 Responses SSE 事件
- 非流式错误统一映射为稳定 translator 错误对象
- 流式中断/坏 JSON/超时等失败统一映射为结构化 `response.failed`
- `previous_response_id` 支持本地持久化续接
- 任意已保存 response id 可在进程重启后继续查找
- `input_image` 支持 URL 与 base64 data URI 的多模态输入映射

## 十、已验证结果

当前已确认：

- Codex 基础聊天可用
- Codex shell 工具调用可用
- Codex 可读代码、改文件、运行测试
- tool-call 双向映射可用
- 流式 tool-call delta 可用
- 非流式错误映射可用
- 流式失败事件结构化可用
- `previous_response_id` 续接已扩展为磁盘持久化
- 多模态 `input_image` 输入已支持

## 十一、已知限制

- `/v1/responses/compact` 仍是最小兼容实现，不是完整 OpenAI compaction 语义。
- 完整会话存储语义（如 `store: true`、跨实例查询、完整历史数据库）尚未实现。
- 上下文存储仅在本机 translator 范围内有效，不支持多机共享。
- 流式中途失败虽然已结构化，但还不保留完整上游原始事件顺序，无法做完全法证级回放。

## 十二、故障排查

查看服务状态：

```bash
systemctl --no-pager --full status codex-translator.service
```

查看日志：

```bash
journalctl -u codex-translator.service -n 100 --no-pager
journalctl -u codex-translator.service -f
```

检查端口：

```bash
ss -ltnp | grep ':3000'
```

检查 Codex provider 配置：

```bash
grep -E '^(model|model_provider) =|\[model_providers\.translator\]|base_url = "http://127.0.0.1:3000' ~/.codex/config.toml
```

常见现象：

- `429 Too Many Requests`：上游模型或通道限流。
- `connection refused 127.0.0.1:3000`：translator 未运行或端口冲突。
- Codex 能聊天但不能改文件：通常说明 tool-call 映射异常或服务跑的是旧代码，应重启 `codex-translator.service` 并重跑测试。
- 日志出现密钥：应立刻轮换密钥，并检查 `.env` 与日志输出。

## 十三、NewAPI 替换结论

截至 2026-06-10，NewAPI 已完成替换：

1. translator 先在 `3002` 验证。
2. 随后迁移到 `3000`。
3. Codex provider 切换到 translator。
4. NewAPI 容器与相关进程被移除。
5. translator 正式接管原 NewAPI 端口。
6. 旧 NewAPI 数据目录已删除。

当前结构：

```text
Codex CLI -> translator (127.0.0.1:3000) -> https://openclawroot.com/v1
```

## 十四、Git 与同步规则

远端仓库：

```text
git@github.com:xiao-fengyu/translator.git
```

当前建议推送方式：

```bash
git push origin HEAD:main
```

忽略的运行时文件：

- `.env`
- `.env.backup*`
- `translator.log`
- `translator.pid`

## 十五、归档记录

### 2026-06-11 归档

本次归档执行目标：

1. 遍历 `/data/translator` 本地目录
2. 把 `README.md` 整理并翻译为中文归档文档
3. 核对本地 git 与 GitHub 远端状态
4. 检查项目目录与远端仓库是否存在不一致
5. 如有归档改动，则提交并推送

本次归档结论：

- 本地代码树与当前 Git 跟踪文件一致
- 运行时文件如 `.env`、`translator.log` 未纳入上传范围
- 归档前本地 `HEAD` 与 `origin/main` 一致
- 本次主要变更是将 `README.md` 重新整理为中文归档版

## 十六、新服务器部署清单

在一台全新的服务器上从零部署 translator，按以下顺序执行：

```bash
# 1. 前置条件：Node.js >= 22
node --version   # 应输出 v22.x.x 或更高

# 2. 克隆仓库
git clone git@github.com:xiao-fengyu/translator.git
cd translator

# 3. 安装依赖
npm install

# 4. 创建配置文件
cp .env.example .env
chmod 600 .env
# 编辑 .env，填入真实的 UPSTREAM_BASE_URL 和 UPSTREAM_API_KEY

# 5. 验证测试
npm test          # 应 29/29 通过
npm run healthcheck

# 6a. 方案 A：手动启动（临时测试）
./scripts/start.sh
curl http://127.0.0.1:3000/healthz

# 6b. 方案 B：systemd 部署（生产推荐）
# 替换 deploy/codex-translator.service 中的占位符后安装
sed -e 's|@PROJECT_ROOT@|'"$(pwd)"'|g' \
    -e 's|@USER@|root|g' -e 's|@GROUP@|root|g' \
    deploy/codex-translator.service \
    | sudo tee /etc/systemd/system/codex-translator.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable codex-translator.service
sudo systemctl restart codex-translator.service
sudo systemctl status codex-translator.service

# 7. 配置 Codex 接入（~/.codex/config.toml）
# 参考本文档「六、Codex 接入方式」

# 8. 冒烟测试
codex exec --ephemeral --skip-git-repo-check -C /tmp 'Reply exactly: pong'
```

## 十七、操作约束

- 不要擅自重启 OpenClaw Gateway。
- 不要打印或提交 API key。
- 优先使用小步修改 + 校验 + 提交。
- 若远端先发生变化，应先 fetch 并核对后再推送。
