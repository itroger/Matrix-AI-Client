import { defineTool } from "eve/tools";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default defineTool({
  description: "列出所有 Orchard 沙箱容器（按 com.orchard.sandbox=true 标签过滤）",
  inputSchema: z.object({
    all: z.boolean().default(true).describe("包含已停止的容器"),
  }),
  async execute({ all }) {
    const args = ["list", "--format", "json"];
    if (all) args.push("--all");
    try {
      const { stdout } = await execFileAsync("container", args, { timeout: 10000 });
      const containers = JSON.parse(stdout.toString());
      const sandboxes = (Array.isArray(containers) ? containers : []).filter(
        (c: { labels?: Record<string, string> }) => c.labels?.["com.orchard.sandbox"] === "true",
      );
      return { count: sandboxes.length, sandboxes };
    } catch (err: unknown) {
      const e = err as { stderr?: Buffer; message?: string };
      return { error: e.message ?? "unknown error", stderr: (e.stderr ?? "").toString().trim() };
    }
  },
});
