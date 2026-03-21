#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KhanClient } from "./khan-api/client.js";
import { createServer, registerAllTools } from "./server.js";

const server = createServer();

const client = new KhanClient();

registerAllTools(server, client);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Khan Academy MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
