import { defineTool } from "eve/tools";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default defineTool({
  description: "按文件名模式搜索文件（使用 find 命令，自动排除 node_modules 和 .git）",
  inputSchema: z.object({
    pattern: z.string().describe("文件名匹配模式（如 *.ts、*.json）"),
    path: z.string().optional().describe("搜索根目录，默认当前目录"),
  }),
  async execute({ pattern, path }) {
    try {
      const { stdout } = await execFileAsync(
        "find",
        [path ?? ".", "-name", pattern, "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*"],
        { timeout: 10000 },
      );
      const files = stdout.toString().trim().split("\n").filter(Boolean);
      return { files };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "搜索失败" };
    }
  },
});
