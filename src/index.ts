import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { closeBrowser } from "./browser/manager.js";

const server = createServer();
const transport = new StdioServerTransport();

async function shutdown() {
  await closeBrowser().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
transport.onclose = () => void shutdown();

await server.connect(transport);
// stdio transport: stdout is the protocol channel — never console.log here.
console.error("canvas3d MCP server ready (stdio)");
