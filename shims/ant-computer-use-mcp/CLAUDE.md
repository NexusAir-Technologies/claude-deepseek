# shim: @ant/computer-use-mcp

> 导航：[/CLAUDE.md](../../../CLAUDE.md) > [Claude-Code/CLAUDE.md](../../CLAUDE.md) > shims/ant-computer-use-mcp/CLAUDE.md

## 模块定位

该模块是 `@ant/computer-use-mcp` 的本地 shim 包，封装 computer-use MCP 的对接入口。

## 入口与接口

- 包名：`@ant/computer-use-mcp`
- 入口：`index.ts`
- 导出：
  - `.` -> `./index.ts`
  - `./types` -> `./types.ts`
  - `./sentinelApps` -> `./sentinelApps.ts`

## 依赖与边界

- 以接口定义与导出稳定性为第一优先级。
- 业务逻辑应保留在主仓库 `src/` 服务层，shim 保持轻量。
