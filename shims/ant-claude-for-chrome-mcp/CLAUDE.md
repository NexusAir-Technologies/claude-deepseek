# shim: @ant/claude-for-chrome-mcp

> 导航：[/CLAUDE.md](../../../CLAUDE.md) > [Claude-Code/CLAUDE.md](../../CLAUDE.md) > shims/ant-claude-for-chrome-mcp/CLAUDE.md

## 模块定位

该模块是 `@ant/claude-for-chrome-mcp` 的本地 shim 包，用于在主工程中通过 file 依赖提供占位入口。

## 入口与接口

- 包名：`@ant/claude-for-chrome-mcp`
- 入口：`index.ts`（由 `package.json.main` 指定）

## 依赖与边界

- 作为 shim，职责应保持最小化：只做接口对齐与适配，不承载业务逻辑。
- 仅通过 `Claude-Code/package.json` 的 file 依赖被主模块引用。
