# magpick - Magpie 网关模型选择器

[English](README.md)

一个为 Claude Code 和 Codex CLI 提供便利的模型选择器，模型目录来自 [Magpie](https://github.com/yetone/magpie)。从网关中选择一个模型（`provider/model`）或路由组，然后以隔离的、仅当前会话生效的配置启动目标 CLI。

## 为什么做这个项目？

如果你用 [Magpie](https://github.com/yetone/magpie) 管理服务商和模型，仍然需要告诉每个 CLI 用哪个模型。常见做法都不太方便：

1. **修改全局配置会影响正在运行的会话** - 改动 `~/.claude/settings.json` 或 `~/.codex/config.toml` 会作用于所有实例，包括已经跑起来的那些。
2. **同一时间只能用一个模型** - 所有会话共享同一份配置，想并行对比两个模型就得手动改配置、重启。
3. **服务商不等于模型** - Magpie 的服务商并不按 “Claude” 和 “Codex” 分类；一个服务商暴露的是协议端点（`anthropic`、`chat`、`responses`、`gemini`），网关负责在协议之间转换。所以你真正要选的是模型。

magpick 延续了 [ccsc](https://github.com/terranc/ccsc) 的交互方式 - 搜索、方向键、预览面板、历史记录 - 并额外提供：

- **环境隔离** - 只影响 magpick 启动的进程，不改变全局设置，也不影响其他正在运行的实例。
- **不污染配置** - 从不修改 `~/.claude/settings.json` 或 `~/.codex/config.toml`。
- **会话级模型选择** - 每个终端会话都可以使用不同的模型。
- **多 CLI 支持** - 同时支持 Claude Code 和 Codex CLI。
- **协议感知** - 只列出能为所选 agent 的 API 提供原生服务的模型。
- **快速切换** - 无需打开 GUI，在终端里交互式选择。

![magpick 模型选择器](assets/screenshot.jpg)

适用场景：

- 多个项目需要不同模型（便宜/快速 vs. 深度推理）。
- 并行用不同模型测试同一份代码。
- 一个 Magpie 网关同时服务 Claude Code 和 Codex CLI。

## 功能特性

- 🖥️ **跨平台** - 支持 macOS、Linux、Windows
- 📦 **安装简单** - 单个 npm 包，无原生模块
- 🔍 **交互式界面** - 按模型 id、显示名、服务商和标签搜索
- 👀 **预览面板** - 选择前查看服务商、原生协议、上下文窗口和最大输出
- 📜 **历史记录** - 最近使用的模型排在最前，并按 agent 分别记录
- ⌨️ **键盘导航** - 完整键盘支持，含 Page Up/Down
- 🔄 **参数透传** - 所有参数原样传给目标 CLI
- 🤖 **多 CLI** - 同时支持 Claude Code 和 Codex CLI
- 🧭 **协议感知列表** - Claude Code 只看到 Anthropic Messages 模型，Codex 只看到 Responses 模型，路由组始终显示
- 🧹 **干净清理** - `--clear` 删除所有生成的配置
- 🧪 **可脚本化** - `--json` 直接打印模型目录，不启动 CLI

## 环境要求

- Node.js >= 18.0.0
- 已安装 [Magpie](https://github.com/yetone/magpie) 且网关正在运行（菜单栏应用、`magpie serve` 或 `magpie daemon`）
- 已安装 [Claude CLI](https://claude.ai/code) 和/或 [Codex CLI](https://github.com/openai/codex)
- 网关需暴露 `GET /v1/models`，Codex 还需要 `GET /v1/codex/models`

## 安装

magpick 尚未发布到 npm（`v0.1.0`）。请从源码安装：

```bash
# 克隆仓库
git clone https://github.com/terranc/magpick.git
cd magpick

# 安装依赖并构建
npm install
npm run build

# 将 `magpick` 加入 PATH
npm link
```

`npm link` 会写入全局 npm 前缀目录；如果该目录不可写，改用仓库内的 `npm install -g .`。

不 link 也可以直接运行：

```bash
node dist/index.js
```

### 验证安装

```bash
magpick --json | head -20
```

能打印出 `models` 数组，说明网关可达且至少启用了一个模型。报错或列表为空，说明 Magpie 没在运行、没有启用服务商，或者网关地址不对。

## 使用

### 启动 Claude Code

```bash
magpick              # 交互选择模型 → 启动 Claude Code
magpick claude       # 同上
```

### 启动 Codex CLI

```bash
magpick codex        # 交互选择模型 → 启动 Codex
```

### 键盘快捷键

| 按键 | 功能 |
|------|------|
| `↑` / `↓` | 上下移动选择（循环） |
| `PgUp` / `PgDn` | 翻页（每页 10 条） |
| `Enter` | 确认选择并启动 |
| `Esc` | 取消 |
| `输入文字` | 搜索/过滤模型 |

### 透传参数

子命令之后的所有参数都会原样传给目标 CLI：

```bash
# Claude Code
magpick --continue
magpick --print "解释一下这个仓库"

# Codex CLI
magpick codex --full-auto
```

magpick 自己的参数（`--gateway`、`--json`、`--clear`）会在转发前被移除。当目标 CLI 需要使用同名参数时，在它前面加 `--`：`--` 之后的内容原样转发，`--` 本身不会被传下去。

```bash
magpick codex -- --json     # --json 传给 Codex，不是 magpick
```

### 查看模型目录

```bash
magpick --json
magpick codex --json
```

在完成协议过滤和历史排序后打印 `{ agent, gateway, models }`，随后退出，不启动 CLI。

### 覆盖网关地址

```bash
magpick --gateway http://192.168.1.10:3425
magpick --gateway=http://192.168.1.10:3425
```

### 清理生成的配置文件

```bash
magpick --clear
```

删除 `~/.claude/magpick-*.settings.json` 和 `~/.magpick/codex/*`。全局 Claude/Codex 配置、Magpie 配置和 `~/.magpick-history` 都会保留。

### 帮助

```bash
magpick --help
magpick codex --help     # magpick 的 codex 子命令帮助
```

想查看目标 CLI 自己的帮助，直接运行 `claude --help` / `codex --help`。

## 工作原理

### Claude Code

magpick 基于你的 `~/.claude/settings.json` 生成 `~/.claude/magpick-<slug>-<hash>.settings.json`，保留 hooks、plugins、permissions、status line 及其他设置，替换冲突的 Anthropic 环境变量，并写入：

```text
model
env.ANTHROPIC_BASE_URL
env.ANTHROPIC_AUTH_TOKEN
env.ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS,FABLE}_MODEL
env.ANTHROPIC_SMALL_FAST_MODEL
```

继承来的 `env.ANTHROPIC_MODEL` 会被清空，让顶层的 `model` 生效。仅当模型上报的上下文窗口小于 200K 时才设置 `CLAUDE_CODE_MAX_CONTEXT_TOKENS`；更大的模型沿用 Claude Code 的默认值。随后 magpick 执行 `claude --settings=<file>` 启动。全局设置文件不会被修改。

### Codex

magpick 创建 `~/.magpick/codex/<slug>-<hash>/`，其中包含：

- `config.toml` - `model_provider = "magpie"`、所选 `model`、`model_catalog_json`、指向网关的 `[model_providers.magpie]` 配置块，以及你原有的其他 Codex 设置（冲突的顶层键和旧的 `[model_providers.magpie]` 段会被移除）。
- `magpie-models.json` - 从 `GET /v1/codex/models` 获取的模型目录。

随后 magpick 以 `CODEX_HOME` 指向该目录的方式启动 `codex`。

### 预览面板

预览面板展示当前高亮模型的详情：

```text
┌────────────────────────────────────────┐
│ DeepSeek V4.1 Flash                    │
│ auto/deepseek-v4.1-flash               │
│ ────────────────────────────────────── │
│ Provider: cpi · routing group          │
│ Native: translated by magpie           │
│ Context: 1M · output 384K              │
│ Gateway: http://127.0.0.1:3425         │
└────────────────────────────────────────┘
```

`Native` 行列出模型原生支持的协议，数据来自 `/v1/models` 的 `native_endpoints`：

- `Anthropic Messages` - `/v1/messages`
- `OpenAI Responses` - `/v1/responses`
- `Chat Completions` - `/v1/chat/completions`
- `Gemini` - Gemini API（`/v1beta`）

它们以方括号形式显示，例如 `Native: [Anthropic Messages, Chat Completions]`。模型没有原生端点时，面板显示 `translated by magpie`，表示请求由网关转换。

### 模型列表

每行格式为 `模型名 · 服务商`，服务商或 `routing group` 后缀为灰色：

```text
 DeepSeek V4.1 Flash · routing group
 GPT-6 Astra · agentrouter
```

由于 agent 在启动前已经确定，选择器只列出能为该 agent 的协议提供原生服务的模型 - Claude Code 对应 `/v1/messages`，Codex 对应 `/v1/responses`。路由组（`auto/...`）本身没有协议，由 Magpie 在每次请求时选择成员，因此始终显示。

列表还会去重。Magpie 会用多个 id 提供同一条目 - 路由组同时是 `auto/<name>` 和裸别名，模型同时是 `provider/model` 和短别名 - 所以 magpick 按（服务商，显示名）保留一行，优先 `provider/model`，其次 `auto/<name>`，最后是裸别名。不同服务商的同名模型仍然分开显示。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MAGPIE_GATEWAY` | Magpie 网关完整 URL | - |
| `MAGPIE_ADDR` | 网关 `host:port` | - |
| `MAGPIE_GATEWAY_KEY` | 网关 key；非 loopback 网关必填 | `magpie`（仅 loopback） |

网关地址解析顺序：

1. `--gateway <url>`
2. `MAGPIE_GATEWAY`（完整 URL）
3. `MAGPIE_ADDR`（`host:port`）
4. `http://127.0.0.1:3425`

缺少协议时默认补 `http://`，末尾的 `/v1` 会被去掉，`0.0.0.0:<port>` / `[::]:<port>` 会改写为 `127.0.0.1`。

### 配置远程网关

```bash
# macOS / Linux
export MAGPIE_GATEWAY=http://192.168.1.10:3425
export MAGPIE_GATEWAY_KEY=your-gateway-key

# Windows (PowerShell)
$env:MAGPIE_GATEWAY = "http://192.168.1.10:3425"
$env:MAGPIE_GATEWAY_KEY = "your-gateway-key"
```

在 Magpie 中创建 key。loopback 请求使用本地 `magpie` token，无需配置。

## 故障排查

| 现象 | 原因 | 处理 |
|------|------|------|
| `Cannot reach Magpie gateway at <url>` | 网关没运行，或地址不对 | 启动 Magpie（菜单栏应用、`magpie serve`、`magpie daemon`），或指定 `--gateway <url>` |
| `Magpie returned HTTP 401` | 远程网关缺少 key | `export MAGPIE_GATEWAY_KEY=<key>` |
| `Magpie returned no models` | Magpie 里没有启用的服务商或模型 | 添加服务商并启用至少一个模型 |
| `No models natively serve the ... API` | 没有启用支持该协议的模型 | 启用 `native_endpoints` 含 `/v1/messages`（Claude Code）或 `/v1/responses`（Codex）的模型 |
| `Magpie returned an invalid Codex catalog` | Magpie 版本过旧，或缺少 `/v1/codex/models` | 升级 Magpie |
| 某个模型不在列表里 | 被协议过滤掉，或与重复条目合并了 | 用 `magpick --json` 核对；路由组始终显示，同服务商重复项只保留一行 |
| 输入后没有任何匹配 | 搜索词太窄 | 清空搜索框 |

## 历史记录

模型使用历史保存在 `~/.magpick-history`，格式为 `timestamp<TAB>agent<TAB>modelId`。最近使用过的模型会排到对应 agent 列表的最前面；未使用过的条目按路由组优先、然后服务商和名称排序。

## 开发

```bash
# 安装依赖
npm install

# 构建一次，或监听变更
npm run build
npm run dev

# 本地测试
node dist/index.js --json
node dist/index.js

# 类型检查
npm run typecheck
```

`README.md` 与 `README.zh-CN.md` 需要保持同步 - 改了一个就要改另一个。

## 技术栈

- [Ink](https://github.com/vadimdemedes/ink) - 用 React 写 CLI
- [ink-text-input](https://github.com/vadimdemedes/ink-text-input) - 文本输入组件
- [React](https://react.dev/) - UI 运行时
- [commander](https://github.com/tj/commander.js) - CLI 框架
- TypeScript，配置文件与进程启动使用 Node.js 内置模块

## 安全性

- magpick 从不读取服务商 API key，只读取网关的模型目录。
- 从不写入 `~/.claude/settings.json` 或 `~/.codex/config.toml`。
- 生成的文件权限为 `0600`。
- `magpick --clear` 只删除 `~/.claude/magpick-*.settings.json` 和 `~/.magpick/codex/`。

## 链接

- [Magpie](https://github.com/yetone/magpie)
- [ccsc](https://github.com/terranc/ccsc) - magpick 沿用其交互体验的 CC Switch CLI 工具
- [Linux Do](https://linux.do/)

## 许可证

MIT
