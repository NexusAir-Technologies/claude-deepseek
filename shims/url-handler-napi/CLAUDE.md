# shim: url-handler-napi

> 导航：[/CLAUDE.md](../../../CLAUDE.md) > [Claude-Code/CLAUDE.md](../../CLAUDE.md) > shims/url-handler-napi/CLAUDE.md

## 模块定位

该模块是 `url-handler-napi` 的本地 shim 包，用于 URL 处理 native 能力的占位接入。

## 入口与接口

- 包名：`url-handler-napi`
- 入口：`index.ts`

## 依赖与边界

- shim 层不引入业务状态，仅处理接口适配。
- 保持与主模块依赖关系单向：主模块依赖 shim。
