# Matrix AI Client

混合 AI Agent 网关：以本地 MLX 为主、Vercel AI Gateway（多云端模型）为备，通过健康探针做动态路由与静默降级，并赋予 Agent 硬件监控、代码检索、时间查询三类内置工具与基于 MCP 的 Google 搜索工具，实现自主多步工程辅助能力。

## 特性

- **混合模型智能路由**：默认探测本地 MLX，健康则用本地模型（低延迟、零成本、隐私本地化）；离线时静默降级到云端
- **Vercel AI Gateway 多模型**：通过统一网关访问 Anthropic / OpenAI / Google / DeepSeek / xAI / 智谱等云端模型，无需单独集成各 provider SDK
- **显式覆盖**：客户端可通过 `preferCloud: true` 强制走云端，或通过 `cloudModel` 指定具体云端模型
- **探针优化**：5 秒 TTL 缓存 + 800ms 硬超时，避免高频请求击穿本地端口
- **自主多步工具调用**：最多 5 轮"思考 → 调工具 → 观察 → 再思考"的自主迭代
- **MCP 工具集成**：`googleSearch` 通过 MCP（Streamable HTTP）挂载到网关 `/mcp` 路由（同进程同端口），网关用 `@ai-sdk/mcp` client 自连接注入，未配置时自动降级跳过
- **Filesystem MCP**：通过 stdio 启动官方 `@modelcontextprotocol/server-filesystem`，提供读写/搜索/目录树等 16 个文件系统工具；允许目录由 `MCP_FS_ROOTS` 控制（默认 home），默认挂载
- **流式响应**：UI Message Stream 输出，响应头注入 `X-Gateway-Provider` / `X-Gateway-Model` 便于链路追踪
- **零前端依赖**：纯后端 Hono 服务，无 React 运行时

## 技术栈

| 维度 | 选型 |
|---|---|
| 运行时 | Node.js |
| Web 框架 | [Hono](https://hono.dev/) + `@hono/node-server` |
| AI 编排 | [Vercel AI SDK](https://ai-sdk.dev/docs)（`streamText` + `tool`） |
| 云端模型 | [Vercel AI Gateway](https://ai-sdk.dev/docs/ai-sdk-gateway)（统一访问多 provider） |
| 参数校验 | Zod |
| MCP | [Model Context Protocol SDK](https://modelcontextprotocol.io)（Streamable HTTP，挂载于 `/mcp`）+ [`@ai-sdk/mcp`](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) client |
| 本地模型 | MLX server（OpenAI 兼容协议，端口 8080） |

## 前置条件

- Node.js ≥ 22
- **Vercel AI Gateway API Key（必需）**：用于云端降级与 `preferCloud` / `cloudModel` 路径，在 [Vercel Dashboard](https://vercel.com/dashboard) 获取
- **本地 MLX（可选）**：在 macOS 上启动 [MLX server](https://github.com/ml-explore/mlx-lm)，监听 `http://127.0.0.1:8080`，加载模型 `mlx-community/gemma-4-e4b-it-OptiQ-4bit`

### 启动本地 MLX 服务

```bash
# 安装 mlx-lm
pip install mlx-lm

# 启动 OpenAI 兼容的 MLX server（端口 8080）
mlx_lm.server --model mlx-community/gemma-4-e4b-it-OptiQ-4bit --port 8080
```

启动后网关会自动探测并路由到本地模型；若未启动，则静默降级到云端。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（创建 .env，填入 AI_GATEWAY_API_KEY）
echo "AI_GATEWAY_API_KEY=your_key_here" > .env

# 3. 开发模式（同时启动 MLX Server 与 Hono 网关，热重载）
npm run dev

# 仅启动 Hono 网关（不启动本地 MLX，自动降级到云端）
npm run dev:web

# 或构建后启动
npm run build
npm start
```

`npm run dev` 会并行启动：
- **MLX Server**：`mlx_lm.server --model mlx-community/gemma-4-e4b-it-OptiQ-4bit --port 8080`（若未安装则自动跳过）
- **Hono 网关**：`tsx watch src/index.ts`（端口 8000，含 `/mcp` MCP 端点）

`Ctrl+C` 会同时终止所有进程。

默认监听 `http://localhost:8000`，可通过 `PORT` 环境变量覆盖。

## API 说明

### `POST /api/chat`

流式对话接口，兼容 Vercel AI SDK UI Message Stream 协议。

**请求体**

```jsonc
{
  "messages": [/* UIMessage 数组 */],
  "route": "local"  // 可选，模型路由控制（见下）
}
```

**`route` 参数**（优先级最高，指定使用的模型）

| 值 | 说明 |
|---|---|
| 不传 | 自动路由：本地 MLX 优先，离线降级到云端 |
| `"local"` | 强制使用本地 MLX 模型 |
| `"cloud"` | 使用默认云端模型（`anthropic/claude-sonnet-5.5`） |
| `"openai/gpt-5.2"` | 指定具体云端模型 ID（见下表） |

> 向后兼容：`preferCloud: true` 等价于 `route: "cloud"`；`cloudModel: "openai/gpt-5.2"` 等价于 `route: "openai/gpt-5.2"`。

**响应**

- 成功：`200`，`Content-Type: text/plain; charset=utf-8`，UI Message Stream 格式（含工具调用状态）
- 失败：`400` / `500`，`{ "error": "..." }`

**响应头（可观测性）**

| Header | 说明 |
|---|---|
| `X-Gateway-Provider` | `local-mlx` 或 `cloud-gateway` |
| `X-Gateway-Model` | 实际使用的模型 ID |

### 支持的云端模型

通过 `route` 参数指定云端模型 ID，默认 `anthropic/claude-sonnet-5.5`：

| 模型 ID | 说明 |
|---|---|
| `anthropic/claude-sonnet-5.5` | Claude Sonnet 5.5（默认） |
| `anthropic/claude-opus-5.5` | Claude Opus 5.5 |
| `anthropic/claude-haiku-5.5` | Claude Haiku 5.5 |
| `openai/gpt-5.2` | GPT-5.2 |
| `openai/gpt-5.2-fast` | GPT-5.2 Fast |
| `openai/gpt-4o` | GPT-4o |
| `openai/gpt-4o-mini` | GPT-4o Mini |
| `google/gemini-3.5-flash` | Gemini 3.5 Flash |
| `google/gemini-2.5-pro` | Gemini 2.5 Pro |
| `deepseek/deepseek-v4-pro` | DeepSeek V4 Pro |
| `spacexai/grok-4.7` | Grok 4.7 |
| `zai/glm-5.3` | 智谱 GLM-5.3 |

**示例**

```bash
# 自动路由（本地 MLX 优先，离线降级云端）
curl -N -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"当前主机内存使用情况？"}]}'

# 强制使用本地 MLX
curl -N -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"route":"local"}'

# 强制使用云端默认模型
curl -N -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"route":"cloud"}'

# 指定云端模型
curl -N -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"route":"openai/gpt-5.2"}'
```

## 内置工具

| 工具 | 功能 | 实现 |
|---|---|---|
| `getLocalHostMetrics` | CPU / 内存 / 系统负载监控 | 真实（`node:os`） |
| `searchProjectCodebase` | 递归检索项目代码/文档，按关键词匹配文件内容 | 真实（`node:fs/promises`，最多 10 条命中） |
| `getCurrentTimestamp` | ISO 时间戳 + 指定时区格式化 | 真实（`Intl.DateTimeFormat`） |
| `googleSearch` | Google 搜索，返回标题/链接/摘要 | MCP（Streamable HTTP，挂载于 `/mcp`，Google Custom Search API，需配置 `GOOGLE_API_KEY` + `GOOGLE_CX`） |
| `read_file` / `read_text_file` / `read_multiple_files` 等 | 文件读写/搜索/目录树等 16 个工具 | MCP（stdio，`@modelcontextprotocol/server-filesystem`，默认挂载） |

> `googleSearch` 通过 MCP（Streamable HTTP）挂载到网关 `/mcp` 路由（`src/lib/mcp-server.ts`，同进程同端口），网关启动时用 `@ai-sdk/mcp` client 自连接注入。MCP 不可用时网关自动跳过该工具，其余工具不受影响。

## 配置

### 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `AI_GATEWAY_API_KEY` | 是 | Vercel AI Gateway API 密钥 |
| `GOOGLE_API_KEY` | 否 | Google Custom Search API 密钥（启用 `googleSearch` 工具时必需） |
| `GOOGLE_CX` | 否 | Google 自定义搜索引擎 ID（启用 `googleSearch` 工具时必需） |
| `MCP_GOOGLE_SEARCH_URL` | 否 | MCP 端点地址，默认 `http://localhost:${PORT}/mcp` |
| `MCP_FS_ROOTS` | 否 | Filesystem MCP 允许访问的根目录（逗号分隔，默认 home） |
| `PORT` | 否 | 服务监听端口，默认 `8000` |

### 网关参数（`src/lib/gateway.ts`）

| 常量 | 默认值 | 说明 |
|---|---|---|
| `LOCAL_MODEL_ID` | `mlx-community/gemma-4-e4b-it-OptiQ-4bit` | 本地模型 ID |
| `DEFAULT_CLOUD_MODEL` | `anthropic/claude-sonnet-5.5` | 默认云端模型 ID |
| `CLOUD_MODELS` | 见上表 | 支持的云端模型列表 |
| `PROBE_TTL_MS` | `5000` | 探针结果缓存时长 |
| `PROBE_TIMEOUT_MS` | `800` | 单次探针硬超时 |

## 项目结构

```
src/
├── index.ts            # Hono 入口，POST /api/chat + /mcp MCP 端点
└── lib/
    ├── gateway.ts      # 本地 MLX ↔ Vercel AI Gateway 路由决策
    ├── agent-tools.ts  # 内置 Agent 工具集（硬件/检索/时间）
    ├── mcp-server.ts   # googleSearch MCP server（Streamable HTTP，挂载于 /mcp）
    └── mcp-tools.ts    # MCP client：自连接 /mcp 注入工具 + stdio 启动 filesystem server
```

## 脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式，并行启动 MLX Server + Hono 网关（热重载） |
| `npm run dev:web` | 仅启动 Hono 网关（热重载，不启动 MLX） |
| `npm run build` | TypeScript 编译到 `dist/` |
| `npm start` | 运行构建产物 |
| `npm run typecheck` | 类型检查（不输出文件） |

## 路由决策流程

```
请求到达
  │
  ├─ route="local" ? ──是──→ 本地 MLX（gemma-4-e4b-it-OptiQ-4bit）
  │
  ├─ route="cloud" ? ──是──→ Vercel AI Gateway（默认云端模型）
  │
  ├─ route="<model-id>" ? ──是──→ Vercel AI Gateway（指定模型）
  │
  └─ route 未传 → 探测本地 MLX (5s 缓存 / 800ms 超时)
                    │
                    ├─ 健康 → 本地 gemma-4-e4b-it-OptiQ-4bit
                    └─ 离线 → 静默降级到 Vercel AI Gateway
```

## License

ISC
