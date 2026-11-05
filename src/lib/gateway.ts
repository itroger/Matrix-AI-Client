// src/lib/gateway.ts
import { createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { LanguageModelV1 } from 'ai';

// 1. 本地 MLX Client（兼容 OpenAI 协议）
export const localMlxClient = createOpenAI({
  baseURL: 'http://127.0.0.1:8080/v1',
  apiKey: 'local-mlx', // mlx_lm.server 默认无需密码，传占位字符串即可
});

export const LOCAL_MODEL_ID = 'mlx-community/gemma-4-e4b-it-OptiQ-4bit';
export const CLOUD_MODEL_ID = 'claude-3-5-sonnet-20241022';

// 2. 内存心跳探针状态缓存
let lastProbeTime = 0;
let isLocalMlxHealthy = false;
const PROBE_TTL_MS = 5000;       // 缓存探测结果 5 秒，避免高频请求击穿本地端口
const PROBE_TIMEOUT_MS = 800;    // 单次探针硬超时 800ms

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
 */
export async function resolveGatewayModel(options?: {
  preferCloud?: boolean;
}): Promise<{ model: LanguageModelV1; provider: 'local-mlx' | 'cloud-anthropic'; modelId: string }> {
  // 如果调用方显式要求云端，或本地探针探测失败，直接回退到云端
  if (options?.preferCloud) {
    return {
      model: anthropic(CLOUD_MODEL_ID),
      provider: 'cloud-anthropic',
      modelId: CLOUD_MODEL_ID,
    };
  }

  const isLocalReady = await checkMlxHealth();
  if (isLocalReady) {
    return {
      model: localMlxClient(LOCAL_MODEL_ID),
      provider: 'local-mlx',
      modelId: LOCAL_MODEL_ID,
    };
  }

  // 本地服务离线，静默降级
  return {
    model: anthropic(CLOUD_MODEL_ID),
    provider: 'cloud-anthropic',
    modelId: CLOUD_MODEL_ID,
  };
}