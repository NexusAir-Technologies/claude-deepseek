# deepseek-claude 使用说明

本文面向需要在新电脑上安装 `deepseek-claude` 并接入 VSCode Claude Code 扩展的用户。

`deepseek-claude` 用 DeepSeek Anthropic-compatible API 启动 Claude Code，并通过 VSCode wrapper 让官方 Claude Code VSCode 扩展走 DeepSeek 配置。

## 环境要求

- Node.js `>= 24.0.0`
- npm
- VSCode
- 官方 Claude Code VSCode 扩展：`anthropic.claude-code`
- 可用的 DeepSeek API Key

如果使用 VSCode Remote WSL，必须在 WSL 内完成安装、登录和 VSCode 集成；不要只在 Windows 本地安装。

## 安装

```bash
npm install -g @nexusair-technologies/claude-deepseek
```

验证命令是否可用：

```bash
deepseek-claude --help
```

如果提示 `deepseek-claude: command not found`，检查 npm 全局命令目录是否在 `PATH` 中：

```bash
npm root -g
npm bin -g
```

WSL 常见修复方式：

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
```

如需永久生效，可把上面这行写入 `~/.bashrc` 或对应 shell 配置文件。

## 登录与配置

执行：

```bash
deepseek-claude login
```

按提示配置 DeepSeek API Key。配置文件默认写入：

```text
~/.deepseek-claude/settings.json
```

配置中会使用 DeepSeek Anthropic-compatible endpoint：

```text
https://api.deepseek.com/anthropic
```

不要把真实 API Key 发到聊天、截图或日志中。

## 默认模型

当前对外只保留两个模型：

| 用途 | 模型 |
| --- | --- |
| 主模型 / Pro | `deepseek-v4-pro[1m]` |
| 快速模型 / Flash / subagent | `deepseek-v4-flash` |

旧模型名会在内部做兼容归一：

- `default`、`deepseek-v4-pro`、`deepseek-reasoner` 会归一到 `deepseek-v4-pro[1m]`
- `deepseek-chat` 会归一到 `deepseek-v4-flash`

## VSCode 集成命令

`deepseek-claude vscode` 下有三个命令：

```bash
deepseek-claude vscode doctor
deepseek-claude vscode install
deepseek-claude vscode restore
```

### doctor

只读诊断，不修改文件：

```bash
deepseek-claude vscode doctor
```

它会检查：

- `~/.deepseek-claude/settings.json` 是否存在
- DeepSeek API URL 是否存在
- DeepSeek API Key 是否存在
- 是否找到 Claude Code VSCode 扩展目录
- 是否找到扩展里的 native binary
- native binary 当前是官方入口还是 DeepSeek wrapper
- 是否存在官方入口备份

典型输出：

```text
DeepSeek VS Code doctor
CLI settings: /home/xxx/.deepseek-claude/settings.json
API URL: present
API Key: present
VS Code extension: /home/xxx/.vscode-server/extensions/anthropic.claude-code-...
Native binary: /home/xxx/.vscode-server/extensions/anthropic.claude-code-.../resources/native-binary/claude
Native state: deepseek wrapper
Official backup: /home/xxx/.vscode-server/extensions/anthropic.claude-code-.../resources/native-binary/claude.official-backup
```

### install

安装 VSCode 集成：

```bash
deepseek-claude vscode install
```

它会：

1. 找到官方 Claude Code VSCode 扩展。
2. 找到扩展里的 native 启动入口：`resources/native-binary/claude`。
3. 如果还没有备份，先备份为 `claude.official-backup`。
4. 把 native 启动入口替换为 DeepSeek wrapper。

执行完成后，需要在 VSCode 执行：

```text
Developer: Reload Window
```

或者重启 VSCode。

### restore

恢复官方 Claude Code VSCode 启动入口：

```bash
deepseek-claude vscode restore
```

它会用 `claude.official-backup` 还原 `resources/native-binary/claude`。

执行完成后，同样需要在 VSCode 执行：

```text
Developer: Reload Window
```

或者重启 VSCode。

## 新电脑标准流程

### Linux / WSL

```bash
npm install -g @nexusair-technologies/claude-deepseek
deepseek-claude login
deepseek-claude vscode doctor
deepseek-claude vscode install
```

然后在 VSCode 执行：

```text
Developer: Reload Window
```

### VSCode Remote WSL

1. 在 Windows 安装 VSCode。
2. 安装官方 Claude Code VSCode 扩展。
3. 连接到目标 WSL 环境。
4. 在 WSL 终端内执行：

```bash
npm install -g @nexusair-technologies/claude-deepseek
deepseek-claude login
deepseek-claude vscode doctor
deepseek-claude vscode install
```

5. 在 Remote WSL 窗口中执行：

```text
Developer: Reload Window
```

重点：Remote WSL 场景下，`vscode install` 必须在 WSL 内执行，因为 VSCode 扩展的 remote 端 native binary 位于 WSL 的 `~/.vscode-server/extensions/` 下。

## 故障排查

### `deepseek-claude: command not found`

说明 npm 全局命令目录不在 `PATH` 中。

检查：

```bash
npm root -g
npm bin -g
```

把 npm global bin 加入 `PATH` 后重试。

### `API Key: missing`

重新执行：

```bash
deepseek-claude login
```

或检查：

```bash
deepseek-claude vscode doctor
```

确认输出中：

```text
API Key: present
```

### `VS Code extension: missing`

说明当前环境没有找到官方 Claude Code VSCode 扩展。

处理方式：

1. 在 VSCode 安装官方 Claude Code 扩展。
2. 如果使用 Remote WSL，确认扩展已安装到 WSL remote 环境。
3. 重新执行：

```bash
deepseek-claude vscode doctor
```

### `Native state: official/unknown`

说明 VSCode 当前仍使用官方 native 启动入口，尚未接入 DeepSeek wrapper。

执行：

```bash
deepseek-claude vscode install
```

然后在 VSCode 执行：

```text
Developer: Reload Window
```

### VSCode 仍然走官方 Claude

按顺序检查：

```bash
deepseek-claude vscode doctor
deepseek-claude vscode install
```

确认 `doctor` 输出：

```text
Native state: deepseek wrapper
```

然后重载 VSCode：

```text
Developer: Reload Window
```

### 想回到官方 Claude Code

执行：

```bash
deepseek-claude vscode restore
```

然后重载 VSCode。

## 安全注意事项

- 不要在聊天、截图、工单或日志中暴露 DeepSeek API Key。
- `vscode doctor` 只显示 `present` / `missing`，不会输出真实 API Key。
- `vscode install` 会修改 VSCode 扩展的 native 启动入口，但会先保留官方备份。
- `vscode restore` 可恢复官方 Claude Code 启动入口。
