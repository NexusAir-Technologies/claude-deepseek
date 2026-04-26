# shim: @ant/computer-use-swift

> 导航：[/CLAUDE.md](../../../CLAUDE.md) > [Claude-Code/CLAUDE.md](../../CLAUDE.md) > shims/ant-computer-use-swift/CLAUDE.md

## 模块定位

该模块是 `@ant/computer-use-swift` 的本地 shim 包，提供 Swift 侧能力桥接的占位入口。

## 入口与接口

- 包名：`@ant/computer-use-swift`
- 入口：`index.ts`

## 依赖与边界

- shim 层只承担接口对齐，不承载复杂控制流。
- 由主模块通过 file 依赖接入。
