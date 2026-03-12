import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";

export function registerSearchTool(server: McpServer, client: KhanClient) {
  server.tool(
    "search",
    "Search Khan Academy for videos, articles, exercises, and courses. Returns matching content with titles, types, and URLs.",
    {
      query: z.string().describe("Search query (e.g., 'photosynthesis', 'quadratic formula', 'intro to python')"),
      limit: z.number().min(1).max(30).default(10).describe("Maximum number of results to return (default: 10)"),
    },
    async ({ query, limit }) => {
      try {
        const results = await client.search(query, limit);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No results found for "${query}". Try a different search term or check the spelling.`,
              },
            ],
          };
        }

        const formatted = results
          .map((r, i) => {
            let line = `${i + 1}. **${r.title}**`;
            if (r.kind && r.kind !== "Unknown") line += ` [${r.kind}]`;
            if (r.parentPath) line += `\n   📍 ${r.parentPath}`;
            if (r.url) line += `\n   ${r.url}`;
            if (r.description) line += `\n   ${r.description}`;
            return line;
          })
          .join("\n\n");

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}":\n\n${formatted}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching Khan Academy: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
