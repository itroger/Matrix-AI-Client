import { defineAgent, defineDynamic } from "eve";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const localMlx = createOpenAICompatible({
  name: "mlx",
  baseURL: "http://127.0.0.1:8080/v1",
  apiKey: "local-mlx",
});

const LOCAL_MODEL_ID = "mlx-community/gemma-4-e4b-it-OptiQ-4bit";
const DEFAULT_CLOUD_MODEL = "anthropic/claude-sonnet-5.5";

let lastProbeTime = 0;
let isLocalMlxHealthy = false;
const PROBE_TTL_MS = 5000;
const PROBE_TIMEOUT_MS = 800;

async function checkMlxHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - lastProbeTime < PROBE_TTL_MS) {
    return isLocalMlxHealthy;
  }
  try {
    const res = await fetch("http://127.0.0.1:8080/v1/models", {
      method: "GET",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    isLocalMlxHealthy = res.ok;
  } catch {
    isLocalMlxHealthy = false;
  }
  lastProbeTime = Date.now();
  return isLocalMlxHealthy;
}

export default defineAgent({
  model: defineDynamic(async () => {
    const isLocalReady = await checkMlxHealth();
    if (isLocalReady) {
      return {
        model: localMlx(LOCAL_MODEL_ID),
        modelContextWindowTokens: 8192,
      };
    }
    return DEFAULT_CLOUD_MODEL;
  }),
});
