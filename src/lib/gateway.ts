// src/lib/gateway.ts
import { createOpenAI } from '@ai-sdk/openai';
import { gateway, LanguageModel } from 'ai';

// 1. 本地 MLX Client（兼容 OpenAI 协议）
export const localMlxClient = createOpenAI({
  baseURL: 'http://127.0.0.1:8080/v1',
  apiKey: 'local-mlx',
});

export const LOCAL_MODEL_ID = 'mlx-community/gemma-4-e4b-it-OptiQ-4bit';
export const DEFAULT_CLOUD_MODEL = 'anthropic/claude-sonnet-5.5';

// 2. Vercel AI Gateway 支持的常用云端模型
export const CLOUD_MODELS = [
  'anthropic/claude-sonnet-5.5',
  'anthropic/claude-opus-5.5',
  'anthropic/claude-haiku-5.5',
  'openai/gpt-5.2',
  'openai/gpt-5.2-fast',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'google/gemini-3.5-flash',
  'google/gemini-2.5-pro',
  'deepseek/deepseek-v4-pro',
  'spacexai/grok-4.7',
  'zai/glm-5.3',
] as unknown as readonly string[];

// 3. 内存心跳探针状态缓存
let lastProbeTime = 0;
let isLocalMlxHealthy = false;
const PROBE_TTL_MS = 5000;
const PROBE_TIMEOUT_MS = 800;

/**
 * 探测本地 MLX 服务健康状态
 */
export async function checkMlxHealth(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && now - lastProbeTime < PROBE_TTL_MS) {
    return isLocalMlxHealthy;
  }

  try {
    const res = await fetch('http://127.0.0.1:8080/v1/models', {
      method: 'GET',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    isLocalMlxHealthy = res.ok;
  } catch {
    isLocalMlxHealthy = false;
  }

  lastProbeTime = Date.now();
  return isLocalMlxHealthy;
}

/**
 * 动态模型决策器
 *
 * route 参数优先级最高：
 * - 'local' → 强制本地 MLX
 * - 'cloud' → 默认云端模型
 * - 其他字符串（如 'openai/gpt-5.2'）→ 指定云端模型 ID
 * - 不传 → 自动路由（本地优先，离线降级云端）
 */
export async function resolveGatewayModel(options?: {
  preferCloud?: boolean;
  cloudModel?: string;
  route?: string;
}): Promise<{ model: LanguageModel; provider: 'local-mlx' | 'cloud-gateway'; modelId: string }> {
  // 1. 显式指定本地模型
  if (options?.route === 'local') {
    return {
      model: localMlxClient.chat(LOCAL_MODEL_ID),
      provider: 'local-mlx',
      modelId: LOCAL_MODEL_ID,
    };
  }

  // 2. 显式指定云端（route === 'cloud' 或具体模型 ID）
  if (options?.route && options.route !== 'local') {
    const cloudModelId = options.route === 'cloud' ? DEFAULT_CLOUD_MODEL : options.route;
    return {
      model: gateway(cloudModelId),
      provider: 'cloud-gateway',
      modelId: cloudModelId,
    };
  }

  // 3. 向后兼容：cloudModel / preferCloud
  if (options?.cloudModel || options?.preferCloud) {
    const cloudModelId = options.cloudModel || DEFAULT_CLOUD_MODEL;
    return {
      model: gateway(cloudModelId),
      provider: 'cloud-gateway',
      modelId: cloudModelId,
    };
  }

  // 4. 自动路由：本地优先，离线降级云端
  const isLocalReady = await checkMlxHealth();
  if (isLocalReady) {
    return {
      model: localMlxClient.chat(LOCAL_MODEL_ID),
      provider: 'local-mlx',
      modelId: LOCAL_MODEL_ID,
    };
  }

  return {
    model: gateway(DEFAULT_CLOUD_MODEL),
    provider: 'cloud-gateway',
    modelId: DEFAULT_CLOUD_MODEL,
  };
}
