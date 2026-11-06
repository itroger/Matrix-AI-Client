// src/index.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamText, UIMessage, stepCountIs, convertToModelMessages } from 'ai';
import { resolveGatewayModel } from './lib/gateway';
import { agentTools } from './lib/agent-tools';
import { loadMcpTools, loadFilesystemMcpTools } from './lib/mcp-tools';
import { mcpHandler } from './lib/mcp-server';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

try { process.loadEnvFile(); } catch {}

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`[Proxy] global fetch dispatcher set to ${proxyUrl}`);
}

let mcpTools: Record<string, unknown> = {};
let filesystemTools: Record<string, unknown> = {};
let closeFilesystem: () => Promise<void> = () => Promise.resolve();

const app = new Hono();

app.all('/mcp', mcpHandler);

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
      tools: { ...agentTools, ...mcpTools, ...filesystemTools } as typeof agentTools,
      stopWhen: stepCountIs(5),
      maxOutputTokens: provider === 'local-mlx' ? 8192 : 4096,
      system: `You are an autonomous engineering assistant.
You have access to tools for system inspection, project searching, and clock querying.
When user asks questions requiring exact system status or codebase info, call the corresponding tools instead of guessing.`,
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
  const mcp = await loadMcpTools();
  mcpTools = mcp.tools;
  const fs = await loadFilesystemMcpTools();
  filesystemTools = fs.tools;
  closeFilesystem = fs.close;
  process.on('SIGTERM', () => { Promise.all([mcp.close(), closeFilesystem()]).finally(() => process.exit(0)); });
  process.on('SIGINT', () => { Promise.all([mcp.close(), closeFilesystem()]).finally(() => process.exit(0)); });
});
