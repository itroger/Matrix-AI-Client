import { defineTool } from "eve/tools";
import { z } from "zod";
import { readdir } from "node:fs/promises";

export default defineTool({
  description: "列出目录内容（返回文件和子目录列表）",
  inputSchema: z.object({
    path: z.string().describe("目录绝对路径"),
  }),
  async execute({ path }) {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return {
        entries: entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
        })),
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "读取目录失败" };
    }
  },
});
