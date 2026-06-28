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

**推荐部署路径：`D:\translator`**（避免 C 盘空间问题）

推荐流程：

```powershell
git clone git@github.com:xiao-fengyu/translator.git D:\translator
cd D:\translator
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

**重要：** 如果从其他路径（如 `C:\eplatform-test\translator`）迁移，需要：
1. 更新计划任务脚本 `C:\ProgramData\codex-translator\run.ps1` 中的路径
2. 杀死占用 3000 端口的旧进程：`Get-Process node | Stop-Process -Force`
3. 重新启动计划任务

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
Invoke-WebRequest http://127.0.0.1:3000/healthz -UseBasicParsing | Select-Object -ExpandProperty Content
```

运行项目测试：

```powershell
npm test
```

如果要验证真实上游链路，可以在 `.env` 配置完成后，调用 `/v1/responses` 或直接使用 Codex CLI 冒烟测试。

## 六、配置 Codex CLI

**这是与 translator 联动的关键步骤。** 升级 Codex 后需要重新验证。

编辑 Codex 配置文件：

```powershell
notepad $HOME\.codex\config.toml
```

加入或确认以下内容（必须有 `model_provider = "translator"`）：

```toml
model = "gpt-5.5"
model_provider = "translator"

[model_providers.translator]
name = "Local Responses Translator"
base_url = "http://127.0.0.1:3000/v1"
wire_api = "responses"
```

**验证连接：** 升级 Codex 后，运行简单测试确保连接通畅：

```powershell
codex exec --ephemeral --skip-git-repo-check -C C:\ "Reply: ok"
```

## 七、更新 translator

进入仓库后执行：

```powershell
.\scripts\upgrade.ps1
```

脚本会先检查工作区是否干净，再快进到远端最新版本，然后重新安装并启动计划任务。

如果你更想手动执行，也可以继续使用：

```powershell
git pull --ff-only
.\scripts\install.ps1
```

## 八、升级 Codex 后的检查清单

当升级 Windows 上的官方 Codex 版本时，执行以下检查：

1. **验证 translator 仍在运行：**
   ```powershell
   Get-Process node -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like "*translator*"}
   ```

2. **检查 3000 端口是否被占用：**
   ```powershell
   Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
   ```

3. **重新配置 Codex config.toml：**
   - 升级可能重置配置，需要重新指定 `model_provider = "translator"`

4. **测试端到端连接：**
   ```powershell
   Invoke-WebRequest http://127.0.0.1:3000/healthz -UseBasicParsing
   codex exec --ephemeral --skip-git-repo-check -C C:\ "Reply: test"
   ```

## 九、故障排查

### 计划任务返回码 267009

**原因：** 进程启动失败，通常因为依赖缺失或路径错误。

**解决：**
```powershell
# 检查 run.ps1 脚本中的路径是否正确
Get-Content C:\ProgramData\codex-translator\run.ps1

# 手动运行脚本查看具体错误
& C:\ProgramData\codex-translator\run.ps1
```

### 3000 端口被占用

**原因：** 旧的 translator 进程或其他服务占用该端口。

**解决：**
```powershell
# 查找占用 3000 端口的进程
$proc = (Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue).OwningProcess
Get-Process -Id $proc

# 杀死进程
Stop-Process -Id $proc -Force
```

### Codex 启动时报 MCP 连接错误

**原因：** translator 未运行或 config.toml 中 base_url 指向错误。

**解决：**
1. 检查 translator 是否运行：`Get-Process node`
2. 检查 config.toml 中 `base_url = "http://127.0.0.1:3000/v1"`
3. 测试 translator 健康状态：`Invoke-WebRequest http://127.0.0.1:3000/healthz -UseBasicParsing`

### C 盘空间不足导致安装失败

**原因：** npm install 或其他操作需要临时空间。

**解决：** 从一开始就部署到 D 盘：`D:\translator`

## 十、卸载

删除计划任务：

```powershell
Unregister-ScheduledTask -TaskName codex-translator -Confirm:$false
Remove-Item -Recurse -Force "$env:ProgramData\codex-translator" -ErrorAction SilentlyContinue
```

如需删除代码目录，再手动清理仓库文件。
