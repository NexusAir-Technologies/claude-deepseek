# Claude-Code 模块上下文

> 导航：[/CLAUDE.md](../CLAUDE.md) > Claude-Code/CLAUDE.md
> 最近深扫：2026-04-26（tools / commands / services）

## 模块定位

`Claude-Code/` 是当前工作区核心模块，承载 Claude Code 还原版的主代码与运行入口。

## 技术栈与运行约束

- 语言：TypeScript（ESM）
- 运行时：Bun（`bun@1.3.5`）
- Node 要求：`>=24.0.0`
- 关键依赖：`ink`、`react`、`@anthropic-ai/sdk`、`@anthropic-ai/claude-agent-sdk`

## 入口与关键路径

- 开发入口：`src/dev-entry.ts`
- CLI 入口：`src/entrypoints/cli.tsx`
- 主程序：`src/main.tsx`
- 查询循环：`src/query.ts`
- 命令聚合：`src/commands.ts`
- 工具聚合：`src/tools.ts`

## 核心调用链（深扫结论）

1. 启动阶段
   - `src/main.tsx` 负责 CLI 参数、配置加载、MCP 装配、会话进入。
   - `src/entrypoints/init.ts` 负责 init 编排：远端设置、policy limits、遥测、清理注册。

2. 命令层
   - `src/commands.ts` 通过 `COMMANDS()` 汇总 builtin 命令，并与 skills/plugins/workflows 合并。
   - `meetsAvailabilityRequirement()` 与 `isCommandEnabled()` 做双重门控。

3. 工具层
   - `src/tools.ts` 通过 `getAllBaseTools()` 统一定义工具全集。
   - `assembleToolPool()` 合并内置与 MCP 工具，保证排序稳定与去重。

4. 查询执行层
   - `src/query.ts` 为主循环：消息标准化、模型调用、工具执行、compact 恢复。
   - `src/services/api/claude.ts` 负责模型 API 交互与 fallback 行为。

5. 工具执行层
   - `src/services/tools/toolOrchestration.ts`：按并发安全属性分批串/并行。
   - `src/services/tools/StreamingToolExecutor.ts`：流式工具执行、中断与错误传播。

6. MCP 与企业治理
   - `src/services/mcp/client.ts`：连接、认证、超时、tool call。
   - `src/services/mcp/config.ts`：多来源配置合并、signature 去重。
   - `src/services/remoteManagedSettings/index.ts` + `src/services/policyLimits/index.ts`：远端托管与策略限制。

## 目录体量（本轮统计）

- `src/commands/`：约 195 个 TS 文件，87 个子目录
- `src/tools/`：约 199 个 TS 文件，53 个子目录
- `src/services/`：约 147 个 TS 文件，22 个子目录

## 测试与质量状态

- 当前未在扫描中识别到标准测试文件（`*.test.*` / `*.spec.*`）。
- 未发现 ESLint/Biome/Vitest/Jest 顶层配置（可能采用内置或外部工作流）。

## 后续建议

1. 权限链路专题：`src/hooks/toolPermission/` + `src/utils/permissions/`
2. API 鲁棒性专题：`src/services/api/`（重试、限流、429/529 回退）
3. MCP 安全专题：`src/services/mcp/`（认证刷新、配置冲突、资源访问边界）
