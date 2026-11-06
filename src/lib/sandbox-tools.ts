// src/lib/sandbox-tools.ts
import { tool } from 'ai';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SANDBOX_LABEL = 'com.orchard.sandbox=true';
const OWNER_LABEL = 'com.orchard.sandbox.owner=matrix-ai-gateway';

export const sandboxTools = {
  runInSandbox: tool({
    description: '在 Apple container 沙箱里执行命令（Orchard 可视化管理）。创建容器、运行命令、返回输出。默认运行完自动停止。',
    inputSchema: z.object({
      image: z.string().default('alpine').describe('容器镜像名'),
      command: z.array(z.string()).describe('容器内执行的命令（数组）'),
      name: z.string().optional().describe('容器名'),
      cpus: z.number().optional().describe('CPU 核数'),
      memory: z.string().optional().describe('内存限制（如 512M）'),
      detach: z.boolean().default(false).describe('后台运行（默认 false，运行完返回）'),
      workdir: z.string().optional().describe('工作目录'),
      timeoutMs: z.number().default(30000).describe('超时毫秒'),
    }),
    execute: async ({ image, command, name, cpus, memory, detach, workdir, timeoutMs }) => {
      const args = ['run', '--label', SANDBOX_LABEL, '--label', OWNER_LABEL];
      if (name) args.push('--name', name);
      if (cpus) args.push('--cpus', String(cpus));
      if (memory) args.push('--memory', memory);
      if (detach) args.push('-d');
      if (workdir) args.push('-w', workdir);
      args.push(image, ...command);
      try {
        const { stdout, stderr } = await execFileAsync('container', args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
        return { stdout: stdout.toString().trim(), stderr: stderr.toString().trim(), exitCode: 0 };
      } catch (err: unknown) {
        const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string; code?: number };
        return {
          stdout: (e.stdout ?? '').toString().trim(),
          stderr: ((e.stderr ?? '').toString().trim()) || (e.message ?? 'unknown error'),
          exitCode: e.code ?? 1,
        };
      }
    },
  }),

  listSandboxes: tool({
    description: '列出所有 Orchard 沙箱容器（com.orchard.sandbox=true）',
    inputSchema: z.object({
      all: z.boolean().default(true).describe('包含已停止的容器'),
    }),
    execute: async ({ all }) => {
      const args = ['list', '--format', 'json'];
      if (all) args.push('--all');
      try {
        const { stdout } = await execFileAsync('container', args, { timeout: 10000 });
        const containers = JSON.parse(stdout.toString());
        const sandboxes = (Array.isArray(containers) ? containers : []).filter(
          (c: { labels?: Record<string, string> }) => c.labels?.['com.orchard.sandbox'] === 'true',
        );
        return { count: sandboxes.length, sandboxes };
      } catch (err: unknown) {
        const e = err as { stderr?: Buffer; message?: string };
        return { error: e.message ?? 'unknown error', stderr: (e.stderr ?? '').toString().trim() };
      }
    },
  }),

  stopSandbox: tool({
    description: '停止/删除沙箱容器',
    inputSchema: z.object({
      name: z.string().describe('容器名或 ID'),
      remove: z.boolean().default(false).describe('停止后删除容器'),
    }),
    execute: async ({ name, remove }) => {
      const results: string[] = [];
      try {
        await execFileAsync('container', ['stop', name], { timeout: 10000 });
        results.push('stopped');
      } catch (err: unknown) {
        results.push(`stop failed: ${(err as { message?: string }).message ?? 'unknown error'}`);
      }
      if (remove) {
        try {
          await execFileAsync('container', ['rm', name], { timeout: 10000 });
          results.push('removed');
        } catch (err: unknown) {
          results.push(`remove failed: ${(err as { message?: string }).message ?? 'unknown error'}`);
        }
      }
      return { results };
    },
  }),
};
