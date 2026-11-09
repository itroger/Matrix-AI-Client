import { defineTool } from "eve/tools";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default defineTool({
  description: "停止/删除沙箱容器",
  inputSchema: z.object({
    name: z.string().describe("容器名或 ID"),
    remove: z.boolean().default(false).describe("停止后删除容器"),
  }),
  async execute({ name, remove }) {
    const results: string[] = [];
    try {
      await execFileAsync("container", ["stop", name], { timeout: 10000 });
      results.push("stopped");
    } catch (err: unknown) {
      results.push(`stop failed: ${(err as { message?: string }).message ?? "unknown error"}`);
    }
    if (remove) {
      try {
        await execFileAsync("container", ["rm", name], { timeout: 10000 });
        results.push("removed");
      } catch (err: unknown) {
        results.push(`remove failed: ${(err as { message?: string }).message ?? "unknown error"}`);
      }
    }
    return { results };
  },
});
