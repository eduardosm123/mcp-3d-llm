/** End-to-end smoke of the MCP layer: real client over stdio. */
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.platform === "win32" ? "npx.cmd" : "npx",
  args: ["tsx", path.resolve("src/index.ts")],
  cwd: path.resolve("."),
});
const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const resources = await client.listResources();
console.log("resources:", resources.resources.length);

const guide = await client.callTool({ name: "get_guidelines", arguments: { topic: "workflow" } });
const guideText = (guide.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
console.log("workflow guide chars:", guideText.length, "| starts:", JSON.stringify(guideText.slice(0, 60)));

const render = await client.callTool({
  name: "render_scene",
  arguments: { file_path: path.resolve("examples/good-threejs-robot.html"), views: ["three-quarter"] },
});
const blocks = render.content as Array<{ type: string }>;
console.log("render blocks:", blocks.map((b) => b.type).join(", "));

const validate = await client.callTool({
  name: "validate_scene",
  arguments: { file_path: path.resolve("examples/defects/floating-parts.html") },
});
const reportText = (validate.content as Array<{ type: string; text?: string }>)[0]?.text ?? "{}";
const report = JSON.parse(reportText);
console.log("validate ok:", report.ok, "| issues:", report.issues.map((i: { id: string }) => i.id).join(", "));

await client.close();
console.log("MCP smoke OK");
