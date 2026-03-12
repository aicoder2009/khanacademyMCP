#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KhanClient } from "./khan-api/client.js";
import { registerSearchTool } from "./tools/search.js";
import { registerTopicTools } from "./tools/topics.js";
import { registerContentTools } from "./tools/content.js";
import { registerTranscriptTool } from "./tools/transcript.js";

const server = new McpServer({
  name: "khanacademy-mcp",
  version: "1.0.0",
  icons: [
    {
      src: "https://raw.githubusercontent.com/aicoder2009/khanacademyMCP/main/assets/khan-logo.png",
      mimeType: "image/png",
    },
  ],
});

const client = new KhanClient();

// Register all tools
registerSearchTool(server, client);
registerTopicTools(server, client);
registerContentTools(server, client);
registerTranscriptTool(server, client);

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
