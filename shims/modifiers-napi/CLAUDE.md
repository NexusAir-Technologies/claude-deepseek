# shim: modifiers-napi

> 导航：[/CLAUDE.md](../../../CLAUDE.md) > [Claude-Code/CLAUDE.md](../../CLAUDE.md) > shims/modifiers-napi/CLAUDE.md

## 模块定位

该模块是 `modifiers-napi` 的本地 shim 包，承担键修饰符相关 native 能力的占位接入。

## 入口与接口

- 包名：`modifiers-napi`
- 入口：`index.ts`

## 依赖与边界

- 作为适配层保持轻量、稳定、可替换。
- 对外契约以 `package.json` 导出定义为准。
