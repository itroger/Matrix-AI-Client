// src/lib/mcp-tools.ts
import { createMCPClient } from '@ai-sdk/mcp';
import { StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';

const require = createRequire(import.meta.url);

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

export async function loadFilesystemMcpTools() {
  const roots = (process.env.MCP_FS_ROOTS || homedir())
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const entry = require.resolve('@modelcontextprotocol/server-filesystem/dist/index.js');
  try {
    const client = await createMCPClient({
      transport: new StdioMCPTransport({ command: 'node', args: [entry, ...roots] }),
      clientName: 'matrix-ai-gateway',
    });
    const tools = await client.tools();
    console.log(`[MCP] connected to filesystem server, roots: ${roots.join(', ')}, tools: ${Object.keys(tools).join(', ') || '(none)'}`);
    return {
      tools,
      close: () => client.close(),
    };
  } catch (err) {
    console.warn('[MCP] filesystem server 不可用，跳过:', err instanceof Error ? err.message : err);
    return {
      tools: {} as Record<string, never>,
      close: () => Promise.resolve(),
    };
  }
}
