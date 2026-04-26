# DeepSeek Claude Changelog

## 0.1.3-beta.4

- 兼容读取官方 `~/.claude/skills` 用户级 skills，DeepSeek 隔离目录优先。
- 兼容读取官方 `~/.claude.json` 用户级 MCP 配置，DeepSeek 隔离配置同名优先。
- 更新 DeepSeek Claude 欢迎界面品牌、蓝色主题、离线 changelog 与紧凑页 ASCII 标识。
- wrapper 默认注入 DeepSeek 运行环境变量，减少安装后手动配置。
