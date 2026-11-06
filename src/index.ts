// src/index.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamText, UIMessage, stepCountIs, convertToModelMessages } from 'ai';
import { resolveGatewayModel } from './lib/gateway';
import { loadFilesystemMcpTools } from './lib/mcp-tools';

try { process.loadEnvFile(); } catch {}

let filesystemTools: Record<string, unknown> = {};
let closeFilesystem: () => Promise<void> = () => Promise.resolve();

const app = new Hono();

app.post('/api/chat', async (c) => {
  try {
    const { messages, preferCloud, cloudModel, route } = await c.req.json<{
      messages: UIMessage[];
      preferCloud?: boolean;
      cloudModel?: string;
      route?: string;
    }>();

    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: 'Invalid messages array' }, 400);
    }

    const { model, provider, modelId } = await resolveGatewayModel({ preferCloud, cloudModel, route });

    const streamResult = streamText({
      model,
      messages: await convertToModelMessages(messages),
      tools: filesystemTools as Record<string, never>,
      stopWhen: stepCountIs(5),
      maxOutputTokens: provider === 'local-mlx' ? 8192 : 4096,
      system: `You are an autonomous engineering assistant with filesystem tools.`,
      onStepFinish: ({ stepNumber, text }) => {
        console.log(`[Agent Gateway] [${provider}] step ${stepNumber} finished, text: ${text.slice(0, 80)}`);
      },
      onError: ({ error }) => {
        console.error(`[Stream Error] [Provider: ${provider}]:`, error);
      },
    });

    return streamResult.toUIMessageStreamResponse({
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Gateway-Provider': provider,
        'X-Gateway-Model': modelId,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[Route Handler Exception]:', errorMsg);
    return c.json({ error: errorMsg }, 500);
  }
});

const port = Number(process.env.PORT) || 8000;

serve({ fetch: app.fetch, port }, async (info) => {
  console.log(`[Matrix AI Gateway] listening on http://localhost:${info.port}`);
  const fs = await loadFilesystemMcpTools();
  filesystemTools = fs.tools;
  closeFilesystem = fs.close;
  process.on('SIGTERM', () => { closeFilesystem().finally(() => process.exit(0)); });
  process.on('SIGINT', () => { closeFilesystem().finally(() => process.exit(0)); });
});
