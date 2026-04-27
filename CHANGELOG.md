# DeepSeek Claude Changelog

## 0.1.3

- 发布首个正式版本，基于 `0.1.3-beta.29` 的 VS Code 官方 Claude Code 扩展兼容链路：支持 `deepseek-vscode use` 接入 `deepseek-claude`，完成 stream-json 初始化、用户消息转发、隔离配置读取、DeepSeek API key 注入与基础诊断。
- 已知限制：VS Code 模式下 MCP 默认偏隔离，需手动配置 `~/.deepseek-claude/settings.json` 中的 DeepSeek key 与代理；DeepSeek API key 验活兼容、MCP filtered 共享与自动诊断将在后续版本完善。

## 0.1.3-beta.29

- 修复 VS Code stream-json 已进入 `sdk_before_ask` 后 API 请求失败并弹登录窗的问题：DeepSeek wrapper 现在会从继承环境、隔离配置 `~/.deepseek-claude/settings.json` 的 `env.ANTHROPIC_API_KEY` 或 `apiKeyHelper` 同步解析 API key，并注入子进程；launch 诊断仅记录 `hasApiKey` 与来源，不记录密钥内容。

## 0.1.3-beta.28

- 修复 VS Code stream-json headless 动态导入 `src/cli/print.js` 时失败的问题：补齐 `src/utils/filePersistence/types.ts` 缺失的 `DEFAULT_UPLOAD_CONCURRENCY`、文件数量限制、输出目录名与持久化结果类型导出，解除 `main_print_import_error` 中的命名导出错误。

## 0.1.3-beta.27

- 修复 VS Code stream-json headless 在 `src/cli/print.js` 动态导入阶段可能因事件循环无活跃 handle 而 code 0 早退的问题：在导入与 `runHeadless()` 执行期间增加 VS Code 专用 keep-alive，并补充 `print_import_error`、`beforeExit` / `exit` 诊断。

## 0.1.3-beta.26

- 修复 VS Code stream-json headless 分支进入后 `runHeadless()` 以 fire-and-forget 方式启动，可能导致 CLI action 返回后子进程自然退出、未进入 SDK 输出循环的问题；改为等待 `runHeadless()` 并补充 print import 与调用前后诊断。

## 0.1.3-beta.25

- 修复 VS Code stream-json 模式下 deep CLI 可能未进入 headless `runHeadless` 分支的问题：当 VS Code 传入 stream-json 输入输出时强制按 `--print` 处理，并在 `main.tsx` 记录 headless 分支判定诊断。

## 0.1.3-beta.24

- VS Code stream-json 诊断上移到 `runHeadless` 外层入口、`StructuredIO` 创建、进入 `runHeadlessStreaming` 前、generator yield 与完成点，定位 deep CLI 启动后未进入内部队列循环的早退位置。

## 0.1.3-beta.23

- VS Code wrapper 增加子进程启动、stdin 转发、stdin 结束与 stderr 行摘要诊断，确认消息是否写入 deep CLI，并捕获 deep CLI 在 stream-json 无 stdout 时的 stderr 错误。

## 0.1.3-beta.22

- VS Code wrapper 的 launch 诊断新增 `packageVersion` 与 `launcherPath`，用于确认客户机实际运行的全局包版本和入口文件，避免误判旧版本日志。

## 0.1.3-beta.21

- VS Code stream-json 模式新增 deep CLI 内部执行路径诊断，记录用户消息入队、队列消费、进入 ask、ask 产出与输出流关闭原因，用于定位子进程无 stdout 结果的问题。

## 0.1.3-beta.20

- VS Code wrapper 新增子进程 stdout 消息摘要诊断，记录 deep CLI 实际输出的 stream-json 消息类型，用于定位用户消息进入后仍 `sdk_stream_ended_no_result` 的原因。

## 0.1.3-beta.19

- 修复 stream-json stdin 输入在用户消息入队后立即关闭时，主循环异步执行尚未产出结果就关闭输出流，导致 VS Code 显示 `sdk_stream_ended_no_result` 的问题。

## 0.1.3-beta.18

- VS Code wrapper 会将扩展传入的对象形式用户消息内容归一化为字符串，避免 CLI 收到 `message.content` 对象后 stream-json 会话正常结束但无 assistant 结果。

## 0.1.3-beta.17

- VS Code wrapper 新增 stdin 消息摘要诊断，记录 control/user 消息类型、请求 ID 与用户消息长度，用于定位扩展发消息后 stream-json 正常结束但无结果的问题。

## 0.1.3-beta.16

- VS Code wrapper 的 `get_settings` 响应改为接近官方结构，补齐 `effective`、`sources`、`applied` 与默认 `permissions`，避免扩展渲染阶段读取权限配置时报错。

## 0.1.3-beta.15

- VS Code 模式下代理 `auth status --json`，向官方扩展返回 DeepSeek 第三方已登录状态，避免跳转官方 Claude 登录页。
- VS Code wrapper 持续代理 `get_settings` control request，避免扩展在配置缓存加载阶段因 CLI 子进程退出而报 `Query closed before response received`。

## 0.1.3-beta.14

- 修复 VS Code SDK stream-json 初始化握手依赖 `--verbose` 输出控制消息的问题。
- VS Code wrapper 会代理首个 `initialize` control request 并立即返回最小初始化响应，避免深层 CLI 启动阶段导致官方扩展握手超时。
- VS Code 模式下自动追加 `--strict-mcp-config` 与 `--bare`，避免用户级 MCP、插件同步和后台初始化在握手前阻塞扩展 60 秒。

## 0.1.3-beta.13

- 修复 VS Code SDK stream-json 模式下 wrapper 使用 `stdio: inherit` 可能导致 stdin 未稳定转发到 Bun 子进程的问题。
- VS Code 模式改为显式 pipe stdin/stdout/stderr，避免 SDK 子进程收到 EOF 后提前退出。

## 0.1.3-beta.12

- 修复 VS Code 扩展传入 `stream-json` SDK 参数但未显式携带 `--print` 时，DeepSeek CLI 仍进入交互模式导致初始化握手超时的问题。
- VS Code 模式下检测到 `--output-format stream-json` 与 `--input-format stream-json` 会自动补齐 `--print`，确保走 headless SDK 流式协议。

## 0.1.3-beta.11

- VS Code 模式下 `deepseek-claude` launcher 改为异步子进程转发，降低 wrapper 对 SDK 初始化握手的影响。
- 新增 `~/.deepseek-claude/vscode-shim.log`，记录 VS Code 扩展传参、Bun 路径、MCP timeout、退出码等诊断信息。

## 0.1.3-beta.10

- 修复 `deepseek-vscode status` 将 beta.8 旧 shim 误判为 current 的问题。
- `deepseek-vscode use` 现在会自动升级缺少 `DEEPSEEK_CLAUDE_VSCODE=1` 标记的旧绝对路径 shim。

## 0.1.3-beta.9

- 修复 VS Code 扩展模式下 legacy MCP 可能卡住初始化握手的问题。
- `deepseek-vscode use` 写入的 shim 会标记 VS Code 模式，默认跳过官方 `~/.claude.json` legacy MCP。
- VS Code 模式默认将 MCP 连接超时降至 5 秒，可通过 `DEEPSEEK_VSCODE_MCP_TIMEOUT` 覆盖。

## 0.1.3-beta.8

- 修复 `deepseek-vscode use` 写入的扩展 shim 依赖 VS Code 进程 PATH 的问题。
- `deepseek-vscode use` 现在写入包内 `deepseek-claude.cjs` 绝对路径，并可升级 beta.7 生成的 legacy shim。

## 0.1.3-beta.7

- 新增 `deepseek-vscode status/use/restore`，用于显式切换 VS Code/Cursor 官方 Claude Code 扩展到 `deepseek-claude`。
- `deepseek-vscode use` 会备份官方 native binary 后写入 DeepSeek 转发脚本，解决扩展绕过 PATH shim 的场景。
- `deepseek-vscode restore` 支持从备份恢复官方扩展行为，避免永久破坏用户环境。

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
