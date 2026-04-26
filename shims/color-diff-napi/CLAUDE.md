# shim: color-diff-napi

> 导航：[/CLAUDE.md](../../../CLAUDE.md) > [Claude-Code/CLAUDE.md](../../CLAUDE.md) > shims/color-diff-napi/CLAUDE.md

## 模块定位

该模块是 `color-diff-napi` 的本地 shim 包，用于提供 native 差异处理能力的占位入口。

## 入口与接口

- 包名：`color-diff-napi`
- 入口：`index.ts`

## 依赖与边界

- 仅保留必要接口适配；复杂逻辑下沉至主模块。
- 通过 file 依赖由主工程引用。
