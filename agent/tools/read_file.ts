import { defineTool } from "eve/tools";
import { z } from "zod";
import { readFile } from "node:fs/promises";

export default defineTool({
  description: "读取主机文件系统上的文件内容（文本）",
  inputSchema: z.object({
    path: z.string().describe("文件绝对路径"),
  }),
  async execute({ path }) {
    try {
      const content = await readFile(path, "utf-8");
      return { content };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "读取失败" };
    }
  },
});
