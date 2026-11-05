// src/lib/agent-tools.ts
import { tool } from 'ai';
import { z } from 'zod';
import os from 'node:os';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

const MAX_FILE_SIZE = 512 * 1024;
const MAX_DEPTH = 8;
const MAX_HITS = 10;

async function walkDir(dir: string, maxDepth: number, results: string[]): Promise<void> {
  if (maxDepth < 0) return;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      await walkDir(full, maxDepth - 1, results);
    } else if (s.isFile() && s.size < MAX_FILE_SIZE) {
      results.push(full);
    }
  }
}

export const agentTools = {
  // 1. 本地硬件监控工具（适合本地 MLX 场景）
  getLocalHostMetrics: tool({
    description: '获取当前主机的 CPU、内存占用以及系统负载状态',
    parameters: z.object({
      detailLevel: z.enum(['summary', 'full']).default('summary').describe('指标详细程度'),
    }),
    execute: async ({ detailLevel }) => {
      const freeMem = os.freemem();
      const totalMem = os.totalmem();
      const usedMemGB = ((totalMem - freeMem) / (1024 ** 3)).toFixed(2);
      const totalMemGB = (totalMem / (1024 ** 3)).toFixed(2);
      const loadAvg = os.loadavg();

      return {
        platform: os.platform(),
        arch: os.arch(),
        memory: `${usedMemGB} GB / ${totalMemGB} GB`,
        loadAverage: detailLevel === 'full' ? loadAvg : loadAvg[0],
        timestamp: new Date().toISOString(),
      };
    },
  }),

  // 2. 本地项目文档与代码检索工具
  searchProjectCodebase: tool({
    description: '检索本地项目代码或技术文档中的关键定义和引用',
    parameters: z.object({
      query: z.string().describe('检索关键词或符号名称'),
      fileType: z.string().optional().describe('限定文件后缀，例如 ts, py, md'),
    }),
    execute: async ({ query, fileType }) => {
      const root = process.cwd();
      const files: string[] = [];
      await walkDir(root, MAX_DEPTH, files);

      const extFilter = fileType ? `.${fileType}` : null;
      const hits: { path: string; snippet: string }[] = [];

      for (const file of files) {
        if (extFilter && extname(file) !== extFilter) continue;
        let content: string;
        try {
          content = await readFile(file, 'utf8');
        } catch {
          continue;
        }
        const idx = content.indexOf(query);
        if (idx >= 0) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(content.length, idx + query.length + 40);
          hits.push({ path: relative(root, file), snippet: content.slice(start, end) });
          if (hits.length >= MAX_HITS) break;
        }
      }

      return { hitsCount: hits.length, results: hits };
    },
  }),

  // 3. 动态时间与时区校验
  getCurrentTimestamp: tool({
    description: '获取当前的 ISO 时间戳以及指定时区的时间字符串',
    parameters: z.object({
      timeZone: z.string().default('Asia/Shanghai').describe('IANA 时区名称，例如 Asia/Shanghai 或 UTC'),
    }),
    execute: async ({ timeZone }) => {
      return {
        iso: new Date().toISOString(),
        formatted: new Intl.DateTimeFormat('zh-CN', {
          timeZone,
          dateStyle: 'full',
          timeStyle: 'long',
        }).format(new Date()),
      };
    },
  }),
};
