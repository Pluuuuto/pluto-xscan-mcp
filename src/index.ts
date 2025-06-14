import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

// 自动解析 xscan 可执行文件路径
function resolveXscanPath(): string {
    try {
        const cmd = os.platform() === "win32" ? "where xscan" : "which xscan";
        const output = execSync(cmd).toString().split(/\r?\n/)[0].trim();
        if (fs.existsSync(output)) {
            console.error(`🔍 已从系统环境变量中找到 xscan 路径：${output}`);
            return path.resolve(output);
        }
    } catch (e) {
        console.error("❌ 无法从系统环境变量中找到 xscan，请确认它已添加到 PATH 中");
    }
    return "xscan"; // fallback
}

const xscanPath = resolveXscanPath();
const xscanDir = path.dirname(xscanPath);

const server = new McpServer({
    name: "xscan-xss",
    version: "1.0.0"
});

server.tool(
    "do-xss-xscan",
    "使用 xscan 工具对目标网站进行完整 XSS 扫描",
    {
        url: z.string().url().describe("目标 URL"),
        extraArgs: z.array(z.string()).optional().describe("xscan spider 命令参数（可选）")
    },
    async ({ url, extraArgs = [] }) => {
        const args = ["spider", "--url", url, ...extraArgs];

        console.error(`🚀 执行命令：${xscanPath} ${args.join(" ")}`);
        console.error(`📂 设置工作目录：${xscanDir}`);

        const proc = spawn(xscanPath, args, {
            cwd: xscanDir,
            windowsHide: false
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => {
            const text = data.toString();
            stdout += text;
            console.error("📤 [stdout]", text.trim());
        });

        proc.stderr.on("data", (data) => {
            const text = data.toString();
            stderr += text;
            console.error("📕 [stderr]", text.trim());
        });

        proc.on("exit", (code, signal) => {
            console.error(`⚠️ 子进程退出：code=${code}, signal=${signal}`);
        });

        return new Promise((resolve, reject) => {
            proc.on("close", (code) => {
                if (code === 0) {
                    resolve({
                        content: [
                            { type: "text", text: "✅ xscan 扫描完成。" },
                            { type: "text", text: stdout || "(无标准输出)" },
                            ...(stderr
                                ? [{ type: "text", text: "⚠️ 错误输出：\n" + stderr } as const]
                                : [])
                        ]
                    });
                } else {
                    reject(new Error(`❌ xscan 执行失败（退出码 ${code}）\n${stderr}`));
                }
            });

            proc.on("error", (err) => {
                reject(new Error(`❌ MCP spawn 失败: ${err.message}`));
            });
        });
    }
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ MCP Server 启动完毕，等待调用 do-xss-xscan");
}

main().catch((err) => {
    console.error("💥 MCP 主程序异常：", err);
    process.exit(1);
});
