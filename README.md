# Matrix AI Client

混合 AI Agent 网关：以本地 MLX 为主、Vercel AI Gateway（多云端模型）为备，通过健康探针做动态路由与静默降级，基于 [Vercel Eve](https://eve.dev) 框架构建，具备主机文件系统工具与 Apple container 沙箱工具（Orchard 可视化管理）。

## 特性

- **Vercel Eve 框架**：基于 Eve Agent 框架，内置 session 管理、流式响应、工具调用编排
- **混合模型智能路由**：默认探测本地 MLX，健康则用本地模型（低延迟、零成本、隐私本地化）；离线时静默降级到云端
- **Vercel AI Gateway 多模型**：通过统一网关访问 Anthropic / OpenAI / Google / DeepSeek / xAI / 智谱等云端模型
- **探针优化**：5 秒 TTL 缓存 + 800ms 硬超时，避免高频请求击穿本地端口
- **主机文件系统工具**：read_file / write_file / list_directory / search_files，直接访问主机 fs
- **Orchard 沙箱工具**：通过 Apple `container` CLI 创建/管理沙箱容器，[Orchard](https://github.com/andrew-waters/orchard) GUI 自动识别可视化管理
- **Eve HTTP Channel**：默认 `/eve/v1/` 路由，session-based API，支持流式事件

## 技术栈

| 维度 | 选型 |
|---|---|
| 运行时 | Node.js ≥ 24 |
| Agent 框架 | [Vercel Eve](https://eve.dev)（`defineAgent` + `defineDynamic` + `defineTool`） |
| 云端模型 | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)（统一访问多 provider） |
| 本地模型 | MLX server（OpenAI 兼容协议，端口 8080） + `@ai-sdk/openai-compatible` |
| 沙箱 | Apple `container` CLI + [Orchard](https://github.com/andrew-waters/orchard) GUI |

## 前置条件

- Node.js ≥ 24
- **Vercel AI Gateway API Key（必需）**：用于云端降级，在 [Vercel Dashboard](https://vercel.com/dashboard) 获取
- **本地 MLX（可选）**：在 macOS 上启动 [MLX server](https://github.com/ml-explore/mlx-lm)，监听 `http://127.0.0.1:8080`
- **Apple container CLI + Orchard（可选）**：沙箱工具需要 [Apple container](https://github.com/apple/container) 1.6.1+ 和 [Orchard](https://github.com/andrew-waters/orchard) GUI

### 启动本地 MLX 服务

```bash
pip install mlx-lm
mlx_lm.server --model mlx-community/gemma-4-e4b-it-OptiQ-4bit --port 8080
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
echo "AI_GATEWAY_API_KEY=your_key_here" > .env

# 3. 开发模式（Eve 热重载）
npm run dev

# 4. 构建生产版本
npm run build
```

`npm run dev` 启动 Eve 开发服务器，默认监听 `http://localhost:3000`。

## API 说明

Eve 默认在 `/eve/v1/` 提供 session-based HTTP API：

| 路由 | 方法 | 说明 |
|---|---|---|
| `/eve/v1/health` | GET | 健康检查 |
| `/eve/v1/info` | GET | Agent 信息 |
| `/eve/v1/session` | POST | 创建会话（可选发送首条消息） |
| `/eve/v1/session/:id` | POST | 发送后续消息 |
| `/eve/v1/session/:id/stream` | GET | 流式事件（NDJSON） |
| `/eve/v1/session/:id/cancel` | POST | 取消当前 turn |
| `/eve/v1/session/:id/clear` | POST | 清除模型历史 |
| `/eve/v1/session/:id/compact` | POST | 压缩上下文 |
| `/eve/v1/session/:id/end` | POST | 结束会话 |

**示例**

```bash
# 创建会话并发送消息
curl -X POST http://localhost:3000/eve/v1/session \
  -H "Content-Type: application/json" \
  -d '{"message":"列出项目根目录文件"}'

# 流式监听
curl -N http://localhost:3000/eve/v1/session/<sessionId>/stream
```

## 自定义工具

### 主机文件系统工具

| 工具 | 功能 |
|---|---|
| `read_file` | 读取主机文件内容（文本） |
| `write_file` | 写入文件（自动创建父目录） |
| `list_directory` | 列出目录内容 |
| `search_files` | 按文件名模式搜索（find 命令） |

### Orchard 沙箱工具

| 工具 | 功能 |
|---|---|
| `run_in_sandbox` | 在 Apple container 沙箱执行命令 |
| `list_sandboxes` | 列出所有 Orchard 沙箱容器 |
| `stop_sandbox` | 停止/删除沙箱容器 |

## 配置

### 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `AI_GATEWAY_API_KEY` | 是 | Vercel AI Gateway API 密钥 |

### 模型路由（`agent/agent.ts`）

| 常量 | 默认值 | 说明 |
|---|---|---|
| `LOCAL_MODEL_ID` | `mlx-community/gemma-4-e4b-it-OptiQ-4bit` | 本地模型 ID |
| `DEFAULT_CLOUD_MODEL` | `anthropic/claude-sonnet-5.5` | 默认云端模型 ID |
| `PROBE_TTL_MS` | `5000` | 探针结果缓存时长 |
| `PROBE_TIMEOUT_MS` | `800` | 单次探针硬超时 |

## 项目结构

```
agent/
├── agent.ts              # defineAgent + defineDynamic 模型路由
├── instructions.md       # 系统提示词
├── tools/
│   ├── read_file.ts      # 主机文件读取
│   ├── write_file.ts     # 主机文件写入
│   ├── list_directory.ts # 目录列表
│   ├── search_files.ts   # 文件搜索
│   ├── run_in_sandbox.ts # Orchard 沙箱执行
│   ├── list_sandboxes.ts # 列出沙箱
│   └── stop_sandbox.ts   # 停止/删除沙箱
└── channels/
    └── eve.ts            # HTTP channel 配置（localDev auth）
```

## 路由决策流程

```
模型调用前
  │
  ├─ 探测本地 MLX (5s 缓存 / 800ms 超时)
  │
  ├─ 健康 → 本地 MLX（gemma-4-e4b-it-OptiQ-4bit）
  │
  └─ 离线 → 静默降级到 Vercel AI Gateway（claude-sonnet-5.5）
```

## License

ISC
