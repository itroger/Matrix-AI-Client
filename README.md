# Matrix AI Client

混合 AI Agent 网关：以本地 MLX 为主、云端 Anthropic 为备，通过健康探针做动态路由与静默降级，并赋予 Agent 硬件监控、代码检索、时间查询三类工具，实现自主多步工程辅助能力。

## 特性

- **混合模型智能路由**：默认探测本地 MLX，健康则用本地模型（低延迟、零成本、隐私本地化）；离线时静默降级到云端 Claude
- **显式覆盖**：客户端可通过 `preferCloud: true` 强制走云端（适用于高复杂度任务）
- **探针优化**：5 秒 TTL 缓存 + 800ms 硬超时，避免高频请求击穿本地端口
- **自主多步工具调用**：最多 5 轮"思考 → 调工具 → 观察 → 再思考"的自主迭代
- **流式响应**：标准 Data Stream 输出，响应头注入 `X-Gateway-Provider` / `X-Gateway-Model` 便于链路追踪
- **零前端依赖**：纯后端 Hono 服务，无 React 运行时

## 技术栈

| 维度 | 选型 |
|---|---|
| 运行时 | Node.js |
| Web 框架 | [Hono](https://hono.dev/) + `@hono/node-server` |
| AI 编排 | [Vercel AI SDK](https://sdk.vercel.ai/docs)（`streamText` + `tool`） |
| 参数校验 | Zod |
| 本地模型 | MLX server（OpenAI 兼容协议，端口 8080） |
| 云端模型 | Anthropic Claude 3.5 Sonnet |

## 前置条件

- Node.js ≥ 18
- **本地 MLX（可选）**：在 macOS 上启动 [MLX server](https://github.com/ml-explore/mlx-lm)，监听 `http://127.0.0.1:8080`，加载模型 `mlx-community/gemma-4-e4b-it-OptiQ-4bit`
- **Anthropic API Key（必需）**：用于云端降级与 `preferCloud` 路径

### 启动本地 MLX 服务

```bash
# 安装 mlx-lm
pip install mlx-lm

# 启动 OpenAI 兼容的 MLX server（端口 8080）
mlx_lm.server --model mlx-community/gemma-4-e4b-it-OptiQ-4bit --port 8080
```

启动后网关会自动探测并路由到本地模型；若未启动，则静默降级到云端 Claude。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY

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
- **Hono 网关**：`tsx watch src/index.ts`（端口 8000）

`Ctrl+C` 会同时终止两个进程。

默认监听 `http://localhost:8000`，可通过 `PORT` 环境变量覆盖。

## API 说明

### `POST /api/chat`

流式对话接口，兼容 Vercel AI SDK Data Stream 协议。

**请求体**

```jsonc
{
  "messages": [/* AI SDK Message 数组 */],
  "preferCloud": false  // 可选，true 时强制走云端 Claude
}
```

**响应**

- 成功：`200`，`Content-Type: text/plain; charset=utf-8`，Data Stream 格式（含工具调用状态）
- 失败：`400` / `500`，`{ "error": "..." }`

**响应头（可观测性）**

| Header | 说明 |
|---|---|
| `X-Gateway-Provider` | `local-mlx` 或 `cloud-anthropic` |
| `X-Gateway-Model` | 实际使用的模型 ID |

**示例**

```bash
curl -N -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"当前主机内存使用情况？"}]}'
```

## 内置工具

| 工具 | 功能 | 实现 |
|---|---|---|
| `getLocalHostMetrics` | CPU / 内存 / 系统负载监控 | 真实（`node:os`） |
| `searchProjectCodebase` | 递归检索项目代码/文档，按关键词匹配文件内容 | 真实（`node:fs/promises`，最多 10 条命中） |
| `getCurrentTimestamp` | ISO 时间戳 + 指定时区格式化 | 真实（`Intl.DateTimeFormat`） |

## 配置

### 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 是 | Anthropic API 密钥 |
| `PORT` | 否 | 服务监听端口，默认 `8000` |

### 网关参数（`src/lib/gateway.ts`）

| 常量 | 默认值 | 说明 |
|---|---|---|
| `LOCAL_MODEL_ID` | `mlx-community/gemma-4-e4b-it-OptiQ-4bit` | 本地模型 ID |
| `CLOUD_MODEL_ID` | `claude-3-5-sonnet-20241022` | 云端模型 ID |
| `PROBE_TTL_MS` | `5000` | 探针结果缓存时长 |
| `PROBE_TIMEOUT_MS` | `800` | 单次探针硬超时 |

## 项目结构

```
src/
├── index.ts            # Hono 入口，POST /api/chat
└── lib/
    ├── gateway.ts      # 本地 MLX ↔ 云端 Anthropic 路由决策
    └── agent-tools.ts  # Agent 工具集（硬件/检索/时间）
```

## 脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式，tsx 热重载 |
| `npm run build` | TypeScript 编译到 `dist/` |
| `npm start` | 运行构建产物 |
| `npm run typecheck` | 类型检查（不输出文件） |

## 路由决策流程

```
请求到达
  │
  ├─ preferCloud=true ? ──是──→ 云端 Claude
  │
  └─ 否 → 探测本地 MLX (5s 缓存 / 800ms 超时)
            │
            ├─ 健康 → 本地 gemma-4-e4b-it-OptiQ-4bit
            └─ 离线 → 静默降级到云端 Claude
```

## License

ISC
