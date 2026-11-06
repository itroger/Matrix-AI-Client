// src/lib/mcp-server.ts
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import type { Context } from 'hono';

type Session = { transport: WebStandardStreamableHTTPServerTransport; server: McpServer };
const sessions = new Map<string, Session>();

function registerGoogleSearch(server: McpServer) {
  server.registerTool(
    'googleSearch',
    {
      description: '通过 Google 搜索获取网络信息，返回标题、链接和摘要',
      inputSchema: {
        query: z.string().describe('搜索关键词'),
        num: z.number().int().min(1).max(10).default(5).describe('返回结果数量，最多 10'),
      },
    },
    async ({ query, num }) => {
      const apiKey = process.env.GOOGLE_API_KEY;
      const cx = process.env.GOOGLE_CX;
      if (!apiKey || !cx) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Google Search 未配置：需要 GOOGLE_API_KEY 和 GOOGLE_CX 环境变量' }) }],
          isError: true,
        };
      }
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${num}`;
      const res = await fetch(url);
      if (!res.ok) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Google Search API 错误: ${res.status}` }) }],
          isError: true,
        };
      }
      const data = await res.json() as {
        items?: Array<{ title?: string; link?: string; snippet?: string }>;
        searchInformation?: { totalResults?: string };
      };
      const results = (data.items || []).map((item) => ({
        title: item.title || '',
        link: item.link || '',
        snippet: item.snippet || '',
      }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ totalResults: data.searchInformation?.totalResults || '0', results }) }],
      };
    },
  );
}

export async function mcpHandler(c: Context) {
  const sessionId = c.req.header('mcp-session-id');
  const existing = sessionId ? sessions.get(sessionId) : undefined;

  if (existing) {
    return await existing.transport.handleRequest(c.req.raw);
  }

  if (c.req.method !== 'POST') {
    return c.text('No valid session', 400);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  const mcp = new McpServer({ name: 'google-search', version: '1.0.0' });
  registerGoogleSearch(mcp);

  transport.onclose = () => {
    const id = transport.sessionId;
    if (id) sessions.delete(id);
    mcp.close().catch(() => {});
  };

  await mcp.connect(transport);
  const response = await transport.handleRequest(c.req.raw);

  if (transport.sessionId) {
    sessions.set(transport.sessionId, { transport, server: mcp });
  }

  return response;
}
