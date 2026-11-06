// src/lib/mcp-tools.ts
import { createMCPClient } from '@ai-sdk/mcp';

export async function loadMcpTools() {
  const port = Number(process.env.PORT) || 8000;
  const url = process.env.MCP_GOOGLE_SEARCH_URL || `http://localhost:${port}/mcp`;
  try {
    const client = await createMCPClient({
      transport: { type: 'http', url },
      clientName: 'matrix-ai-gateway',
    });
    const tools = await client.tools();
    console.log(`[MCP] connected to google-search server at ${url}, tools: ${Object.keys(tools).join(', ') || '(none)'}`);
    return {
      tools,
      close: () => client.close(),
    };
  } catch (err) {
    console.warn('[MCP] google-search server 不可用，跳过 MCP 工具:', err instanceof Error ? err.message : err);
    return {
      tools: {} as Record<string, never>,
      close: () => Promise.resolve(),
    };
  }
}
