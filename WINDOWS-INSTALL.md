# Windows 安装手册

本文档面向在 Windows Server 上部署 Codex，并让 translator 同机运行的场景。

translator 本身是 Node.js 服务，不依赖 systemd，可以在 Windows 上运行。

## 一、前置条件

需要：

- Windows Server 2019/2022 或更高
- Node.js `>= 22`
- npm
- git
- PowerShell 5.1 或 PowerShell 7+

检查命令：

```powershell
node --version
npm --version
git --version
$PSVersionTable.PSVersion
```

## 二、从 GitHub 安装

推荐流程：

```powershell
git clone git@github.com:xiao-fengyu/translator.git
cd translator
.\scripts\install.ps1
```

安装脚本会自动：

- 检查 `node`、`npm`
- 如果没有 `node_modules`，执行 `npm install`
- 如果没有 `.env`，从 `.env.example` 创建
- 生成计划任务和后台运行脚本
- 启动 translator

如果你已经在目标机上把仓库同步好了，只想更新安装：

```powershell
.\scripts\install.ps1
```

## 三、配置上游模型

编辑 `.env`：

```powershell
notepad .env
```

至少确认：

```text
UPSTREAM_BASE_URL=https://your-openai-compatible-server/v1
UPSTREAM_API_KEY=your-api-key
DEFAULT_MODEL=your-model-name
TRANSLATOR_MODELS=your-model-name
```

注意：

- `.env` 包含密钥，不要提交到 GitHub。
- `UPSTREAM_BASE_URL` 应指向 OpenAI-compatible `/v1` 根地址。
- 修改 `.env` 后重新运行安装脚本，或重启计划任务。

## 四、启动与停止

启动：

```powershell
.\scripts\start.ps1
```

停止：

```powershell
.\scripts\stop.ps1
```

## 五、验证安装

检查健康状态：

```powershell
Invoke-WebRequest http://127.0.0.1:3000/healthz | Select-Object -ExpandProperty Content
```

运行项目测试：

```powershell
npm test
```

如果要验证真实上游链路，可以在 `.env` 配置完成后，调用 `/v1/responses` 或直接使用 Codex CLI 冒烟测试。

## 六、配置 Codex CLI

编辑 Codex 配置文件：

```powershell
notepad $HOME\.codex\config.toml
```

加入或确认：

```toml
model_provider = "translator"

[model_providers.translator]
name = "Local Responses Translator"
base_url = "http://127.0.0.1:3000/v1"
wire_api = "responses"
```

## 七、更新 translator

```powershell
git pull --ff-only
.\scripts\install.ps1
```

## 八、卸载

删除计划任务：

```powershell
Unregister-ScheduledTask -TaskName codex-translator -Confirm:$false
Remove-Item -Recurse -Force "$env:ProgramData\codex-translator" -ErrorAction SilentlyContinue
```

如需删除代码目录，再手动清理仓库文件。
