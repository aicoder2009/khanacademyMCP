import { createMcpHandler } from "mcp-handler";
import { KhanClient } from "../src/khan-api/client.js";
import { registerAllTools, SERVER_INFO } from "../src/server.js";

const handler = createMcpHandler(
  (server) => {
    const client = new KhanClient();
    registerAllTools(server, client);
  },
  {
    serverInfo: SERVER_INFO,
  } as any,
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
