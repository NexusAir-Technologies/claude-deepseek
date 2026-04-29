# DeepSeekClaude 安装与使用教程

> [!IMPORTANT]
> 这是一个**第三方项目**，**不是 Anthropic 官方产品**。  
> 它借鉴了 Claude Code 的使用方式，但默认使用的是 **DeepSeek API**。

## 这是什么？

DeepSeekClaude 是一个在终端中使用的 AI 助手。  
它的目标不是单纯提供一个命令行工具，而是让你**更方便地把 DeepSeek 和 Claude Code 风格工作流结合起来使用**。

你可以把它理解为：

- 使用 **DeepSeek API** 作为底层模型能力
- 借鉴 **Claude Code** 的交互方式和使用体验
- 让你在终端中更自然地完成读代码、改文件、生成命令、排查问题等工作

你可以用它来：

- 阅读和理解项目代码
- 修改文件
- 生成命令
- 排查报错
- 在当前项目目录中进行对话式协作

如果你只关心怎么安装，可以直接看下面的步骤。

---

## 这个项目有什么优势？

### 1. 上手门槛相对更低 (^_^)b

这个项目把“配置 DeepSeek API + 接入 Claude 风格工作流 + 在终端里真正跑起来”这件事尽量做得更简单了。

相比自己从零拼装 API、终端工具和命令行工作流，使用这个项目可以更快开始，也更适合第一次接触这类工具的用户。

### 2. 更方便地使用 DeepSeek + Claude 风格工作流

根据 DeepSeek 官方 API 文档，当前已经明确支持：

- **Anthropic 兼容接口**
- **deepseek-v4-flash**
- **deepseek-v4-pro**

这意味着可以用更接近 Claude 风格的方式接入 DeepSeek，而这个项目正好把这条使用路径进一步简化了。

### 3. 可以与 Claude 并行使用

由于路径隔离，这个项目可以和 Claude 分开使用，互不干扰。  
如果你已经在使用 Claude，仍然可以同时体验或接入 DeepSeekClaude，而不需要把两者混在同一套路径和环境里。

### 4. 使用过程更稳定

按照部分 DeepSeek 接入 Claude 的教程进行配置时，实测可能会遇到 **400 报错**，即使使用 `cc switch` 也没有很好地解决。  
而这个项目已经把接入路径做了收敛和整理，实际使用中更容易直接跑起来，也能更好地避开这类常见的初始配置问题。

### 5. DeepSeek-V4 系列能力更强

根据 DeepSeek 官方说明，DeepSeek-V4 开创了一种新的注意力机制，在 token 维度进行压缩，并结合 **DSA 稀疏注意力（DeepSeek Sparse Attention）**，实现了领先的长上下文能力，同时显著降低了计算和显存需求。

从现在开始，**1M（100 万）上下文** 将作为 DeepSeek 官方服务的标配。  
这对代码理解、长文档处理、复杂任务拆解和连续对话都很有价值。

### 6. 更适合代码、文档和 Agent 类任务

根据官方说明，DeepSeek-V4 已对 **Claude Code、OpenClaw、OpenCode、CodeBuddy** 等主流 Agent 产品进行了适配和优化，在：

- 代码任务
- 文档生成任务
- Agent 类工作流

这些场景中的表现都有提升。  
这也是这个项目值得关注的原因之一：它更适合承接 DeepSeek-V4 进入终端协作场景后的实际使用价值。

### 7. 成本优势更明显

根据官方说明，DeepSeek-V4 系列不仅强调能力，也强调价格与成本优势。

如果底层算力能力和推理效率继续提升，那么这类基于 DeepSeek API 的方案，在长期使用中的吸引力通常会进一步增强。  
对于需要高频调用、长期接入工作流的用户来说，这一点很重要。

### 8. 开源，可用于二次开发

这个项目是开源的。

这意味着它不只是一个“拿来就用”的工具，也可以作为一个基础项目继续扩展，例如：

- 根据自己的团队流程做定制
- 接入自己的配置方式
- 增加新的命令或交互逻辑
- 用于学习类似工具的实现方式

如果后续需要做定制化开发、团队集成或功能扩展，开源会带来更大的灵活性。

### 9. 后续会持续补强生态能力 (￣▽￣)／

后续还会持续开发一些更实用的配套能力，例如：

- **MCP 服务器配置器**：帮助用户更方便地管理和接入 MCP 服务
- **全局记忆注入器**：支持注入多种语言风格和长期记忆配置

在语言风格方面，可以定制不同的输出风格，包括但不限于：

- 猫娘工程师
- 丰川祥子工程师
- 绫波丽工程师
- 以及其他可扩展风格

这意味着它后续不只是一个安装工具，还会逐步扩展成更完整的使用环境。

### 10. 兼容 `.claude` 下的 skill 和 MCP

如果你已经有自己的 `.claude` 配置，这个项目也更容易融入现有使用习惯。

它的一个优势是：可以兼容 `.claude` 目录下已有的 **skill** 和 **MCP** 配置，这样在迁移或并行使用时会更顺手，也更容易复用已有能力 (￣ω￣)ﾉ




---

## 开始前要准备什么

在开始安装前，你需要准备：

- 一个 **DeepSeek API Key**
- 一个可用的终端环境：**WSL（Linux）** 或 **PowerShell**
- **Node.js** 和 **npm**
- 可以联网访问 DeepSeek API 的网络环境

如果你还没有 DeepSeek API Key，可以先参考 DeepSeek 官方中文文档：  
https://api-docs.deepseek.com/zh-cn/

> 如果在执行 `npm install -g @nexusair-technologies/claude-deepseek` 时出现下载缓慢、超时或安装失败，通常与当前网络环境有关。  
>  
> 如果在启动后出现无法连接 API 的情况，也可能与网络访问限制有关。  
>  
> 请根据你所在网络环境，自行确认是否需要调整网络配置。

---

## 最短使用流程

如果你只想先快速装好，可以先看这一段：

1. 准备好 **DeepSeek API Key**
2. 选择一种终端环境：**WSL（Linux）** 或 **PowerShell**
3. 安装 **Node.js LTS**
4. 确认 `node -v` 和 `npm -v` 能正常输出版本号
5. 执行 `npm install -g @nexusair-technologies/claude-deepseek`
6. 执行 `deepseek-claude`
7. 输入 DeepSeek API Key
8. 开始使用

以下只介绍 **简化版** 的 Node.js 安装步骤。  
如果你在安装 Node.js 时遇到问题，且本教程无法解决，可以自行查阅 B 站、CSDN 等网站上的 **Node.js 安装教程**。

如果你不知道具体怎么做，再继续看下面的详细步骤。

---

## 第 1 部分：先准备终端环境

### 方案 A：使用 WSL（Linux）

适合希望使用 Linux 终端环境的用户。

#### 第 1 步：安装 WSL

如果你的电脑还没有 WSL，就先以 **管理员身份** 打开 PowerShell：

1. 点击开始菜单
2. 搜索 `PowerShell`
3. 在 PowerShell 上点击右键
4. 选择“以管理员身份运行”

然后执行：

```powershell
wsl --install
```

执行完成后，通常会自动安装：

- WSL 组件
- 虚拟机平台组件
- Ubuntu

接着按系统提示重启电脑。

#### 第 2 步：完成 Ubuntu 初始化

电脑重启后，Windows 通常会自动继续安装 Ubuntu。  
如果没有自动弹出，你也可以：

1. 打开开始菜单
2. 搜索 `Ubuntu`
3. 打开 Ubuntu

第一次启动 Ubuntu 时，通常会看到初始化过程，请耐心等待。  
初始化完成后，系统一般会提示你：

- 创建一个 Linux 用户名
- 设置一个 Linux 密码

按提示输入并完成即可。

> 这里的用户名和密码是给 WSL 里的 Ubuntu 使用的，  
> 不一定等同于你的 Windows 用户名和密码。

#### 第 3 步：打开 WSL 终端

Ubuntu 初始化完成后，后续要进入 WSL 时：

1. 打开开始菜单
2. 搜索 `Ubuntu`
3. 打开 Ubuntu 终端

打开后，你会看到 Linux 命令行界面。

### 方案 B：使用 PowerShell

适合希望直接在 Windows 原生环境中安装的用户。

#### 第 1 步：打开 PowerShell

1. 按键盘上的 Windows 键
2. 输入 `PowerShell`
3. 打开 **PowerShell**

打开后，你会看到一个可以输入命令的窗口。

---

## 第 2 部分：安装 Node.js 和 npm

普通用户建议安装 **Node.js LTS（长期支持版）**。

### 如果你使用的是 WSL（Ubuntu）

在 WSL 终端中执行：

```bash
sudo apt update
sudo apt install -y nodejs npm
```

### 如果你使用的是 PowerShell

#### 方法 1：使用 winget 安装（推荐）

在 PowerShell 中执行：

```powershell
winget install OpenJS.NodeJS.LTS
```

安装 Node.js 时，**npm 通常会一起安装**。

#### 方法 2：使用 Node.js 官方 Windows 安装包

如果你不使用 winget，也可以直接下载安装 **Node.js 官方提供的 Windows 安装包**。  
安装完成后，**npm 通常也会一起安装**。

---

## 第 3 部分：检查 Node.js 和 npm 是否安装成功

无论你使用的是 WSL 还是 PowerShell，都执行：

```bash
node -v
npm -v
```

如果能看到版本号，说明 Node.js 和 npm 已安装成功。

例如：

```bash
v22.0.0
10.5.1
```

如果 `node -v` 或 `npm -v` 无法使用：

1. 先关闭当前终端
2. 重新打开终端
3. 再执行一次 `node -v` 和 `npm -v`

如果仍然不行，说明 Node.js 安装没有成功，需要重新安装。

---

## 第 4 部分：如果 Node.js 版本过旧怎么办

先查看当前版本：

```bash
node -v
```

如果你确认版本过旧，建议直接更换为较新的 **LTS 版本**。  
对于普通用户，最省事的做法就是：

- 不继续纠结旧版本能不能凑合用
- 直接换成新的 **Node.js LTS**

如果你使用的是 PowerShell，可以重新安装：

```powershell
winget install OpenJS.NodeJS.LTS
```

如果你使用的是 WSL，建议重新安装到较新的 LTS 版本。  
如果你后续需要频繁切换 Node 版本，再学习使用 Node 版本管理器。

---

## 第 5 部分：安装 DeepSeekClaude

在终端中执行：

```bash
npm install -g @nexusair-technologies/claude-deepseek
```

等待安装完成。

---

## 第 6 部分：启动 DeepSeekClaude

执行：

```bash
deepseek-claude
```

如果命令能够正常启动，说明 DeepSeekClaude 安装成功。

---

## 第 7 部分：完成首次配置

首次启动时，程序通常会引导你完成配置。  
按提示输入：

- **DeepSeek API Key**

完成后即可开始使用。

---

## 常见问题

### 1. `wsl --install` 执行失败怎么办

先确认：

- 你是在 **PowerShell（管理员）** 中执行的
- 当前 Windows 版本支持 WSL
- 执行后是否已经按提示重启电脑

### 2. 安装完 Node.js 后，`node -v` 或 `npm -v` 还是不能用

按这个顺序处理：

1. 关闭当前终端
2. 重新打开终端
3. 再执行：

```bash
node -v
npm -v
```

如果还是不行，说明 Node.js 安装没有成功，需要重新安装。

### 3. 执行 `deepseek-claude` 提示找不到命令

通常按下面顺序检查：

1. `npm install -g` 是否执行成功
2. 当前终端是否已经重新打开
3. npm 全局安装目录是否已加入 PATH

### 4. 启动时报网络或认证错误

优先检查：

- DeepSeek API Key 是否正确
- 当前网络是否能访问 DeepSeek API

---

## 免责声明

- 本项目为第三方项目，**不是 Anthropic 官方产品**
- 使用前请确认你理解并接受相关 API 服务条款
- 使用 API 可能产生费用，请留意你的 DeepSeek 账户情况
- 请勿将本工具用于违规、违法或不安全用途
