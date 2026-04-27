# DeepSeek Claude Changelog

## 0.1.3-beta.6

- 新增 `code-deepseek` 命令，可开箱即用启动 VS Code 并注入 `claude` shim。
- VS Code 官方 Claude Code 扩展调用 `claude` 时会转发到 `deepseek-claude`，无需客户手动创建本地脚本。
- `code-deepseek` 仅影响其启动的 VS Code 会话，不修改用户全局 PATH。

## 0.1.3-beta.5

- 强化 DeepSeek wrapper 环境隔离，固定官方 Anthropic-compatible API 地址。
- 启动时清理继承的官方 Claude token，避免登录态与 DeepSeek API 混用。
- 保留官方 skills 与 MCP 兼容读取，同时过滤 legacy MCP 中的 Claude 登录与路由环境变量。
- 已存在的隔离 settings 会自动补齐并修正 DeepSeek 默认运行环境。

## 0.1.3-beta.4

- 兼容读取官方 `~/.claude/skills` 用户级 skills，DeepSeek 隔离目录优先。
- 兼容读取官方 `~/.claude.json` 用户级 MCP 配置，DeepSeek 隔离配置同名优先。
- 更新 DeepSeek Claude 欢迎界面品牌、蓝色主题、离线 changelog 与紧凑页 ASCII 标识。
- wrapper 默认注入 DeepSeek 运行环境变量，减少安装后手动配置。
