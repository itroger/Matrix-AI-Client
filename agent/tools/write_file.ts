import { defineTool } from "eve/tools";
import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export default defineTool({
  description: "写入文件到主机文件系统（自动创建父目录）",
  inputSchema: z.object({
    path: z.string().describe("文件绝对路径"),
    content: z.string().describe("文件内容"),
  }),
  async execute({ path, content }) {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
      return { success: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "写入失败" };
    }
  },
});
