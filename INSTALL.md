# Linux 安装手册

本文档面向想在 Linux 服务器上从 GitHub 安装 `codex-responses-translator` 的用户。

translator 的作用是把 Codex CLI 使用的 OpenAI Responses API 翻译成 OpenAI-compatible Chat Completions API。安装完成后，本机服务默认监听：

```text
http://127.0.0.1:3000/v1
```

## 一、前置条件

目标机器需要具备：

- Linux + systemd
- Node.js `>= 22`
- npm
- git
- sudo 权限

检查命令：

```bash
node --version
npm --version
git --version
systemctl --version
```

## 二、从 GitHub 安装

推荐安装路径：

```bash
git clone git@github.com:xiao-fengyu/translator.git
cd translator
./scripts/install.sh
```

安装脚本会自动执行：

- 检查 `node`、`npm`、`systemctl`
- 如果没有 `node_modules`，执行 `npm install`
- 如果没有 `.env`，从 `.env.example` 创建并设置权限为 `600`
- 根据 `deploy/codex-translator.service` 生成 systemd 服务文件
- 安装、启用并重启 `codex-translator.service`
- 输出服务状态

如果你想跳过依赖安装，可以使用：

```bash
INSTALL_DEPS=0 ./scripts/install.sh
```

## 三、配置上游模型

首次安装后，编辑 `.env`：

```bash
nano .env
```

至少需要确认：

```bash
UPSTREAM_BASE_URL=https://your-openai-compatible-server/v1
UPSTREAM_API_KEY=your-api-key
DEFAULT_MODEL=your-model-name
TRANSLATOR_MODELS=your-model-name
```

注意：

- `.env` 包含密钥，不要提交到 GitHub。
- `UPSTREAM_BASE_URL` 应指向 OpenAI-compatible `/v1` 根地址。
- 修改 `.env` 后需要重启服务。

重启命令：

```bash
sudo systemctl restart codex-translator.service
```

## 四、验证安装

查看服务状态：

```bash
systemctl --no-pager --full status codex-translator.service
```

检查本地健康状态：

```bash
curl -fsS http://127.0.0.1:3000/healthz
```

在项目目录运行：

```bash
npm run healthcheck
```

如需验证 translator 到上游模型的真实链路：

```bash
TRANSLATOR_DEEP_CHECK=1 npm run healthcheck
```

## 五、配置 Codex CLI

编辑 Codex 配置文件：

```bash
nano ~/.codex/config.toml
```

加入或确认：

```toml
model = "your-model-name"
model_provider = "translator"

[model_providers.translator]
name = "Local Responses Translator"
base_url = "http://127.0.0.1:3000/v1"
wire_api = "responses"
```

然后测试：

```bash
codex exec --ephemeral --skip-git-repo-check -C /tmp 'Reply exactly: pong'
```

## 六、更新 translator

进入安装目录：

```bash
cd translator
```

拉取最新代码并重装服务：

```bash
git pull --ff-only
./scripts/install.sh
```

如果 `.env` 已存在，安装脚本不会覆盖它。

## 七、卸载服务

停止并禁用 systemd 服务：

```bash
sudo systemctl disable --now codex-translator.service
sudo rm -f /etc/systemd/system/codex-translator.service
sudo systemctl daemon-reload
```

如需删除代码目录：

```bash
cd ..
rm -rf translator
```

删除前请确认 `.env` 中没有还需要保留的配置。

## 八、常见问题

### 1. `systemctl is required for installation`

目标机器不是 systemd 环境，不能使用当前安装脚本。可以改用手动启动：

```bash
npm start
```

### 2. `.env still contains placeholder UPSTREAM_API_KEY=replace-me`

说明还没有填真实 API key。编辑 `.env` 后重启服务。

### 3. `connection refused 127.0.0.1:3000`

translator 没启动或端口被占用。查看：

```bash
systemctl --no-pager --full status codex-translator.service
journalctl -u codex-translator.service -n 100 --no-pager
```

### 4. 本地健康检查通过，深度检查失败

通常是上游地址、API key、模型名或网络问题。先检查 `.env`，再看服务日志。

### 5. Codex 能聊天但不能改文件

通常说明工具调用映射异常或服务运行的是旧代码。更新代码后执行：

```bash
./scripts/install.sh
```

然后重跑 Codex 冒烟测试。
