// src/index.ts
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamText, Message } from 'ai';
import { resolveGatewayModel } from './lib/gateway';
import { agentTools } from './lib/agent-tools';

const app = new Hono();

app.post('/api/chat', async (c) => {
  try {
    const { messages, preferCloud } = await c.req.json<{
      messages: Message[];
      preferCloud?: boolean;
    }>();

    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: 'Invalid messages array' }, 400);
    }

    const { model, provider, modelId } = await resolveGatewayModel({ preferCloud });

    const streamResult = streamText({
      model,
      messages,
      tools: agentTools,
      maxSteps: 5,
      system: `You are an autonomous engineering assistant.
You have access to tools for system inspection, project searching, and clock querying.
When user asks questions requiring exact system status or codebase info, call the corresponding tools instead of guessing.`,
      onStepFinish: ({ stepType, toolCalls, toolResults }) => {
        if (toolCalls && toolCalls.length > 0) {
          console.log(`[Agent Gateway] [${provider}] Step Type: ${stepType}`);
          toolCalls.forEach((call) => {
            console.log(`  -> Called tool: ${call.toolName} with args:`, call.args);
          });
        }
        if (toolResults && toolResults.length > 0) {
          toolResults.forEach((res) => {
            console.log(`  <- Result for: ${res.toolName}:`, JSON.stringify(res.result).slice(0, 100));
          });
        }
      },
      onError: ({ error }) => {
        console.error(`[Stream Error] [Provider: ${provider}]:`, error);
      },
    });

    return streamResult.toDataStreamResponse({
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

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[Matrix AI Gateway] listening on http://localhost:${info.port}`);
});
