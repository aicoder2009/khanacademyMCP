import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";

export function registerSearchTool(server: McpServer, client: KhanClient) {
  server.tool(
    "search",
    "Search Khan Academy's library for videos, articles, exercises, and courses by keyword. Returns titles, types, parent topic paths, and URLs. Use this when looking for specific content or topics.",
    {
      query: z.string().describe("Search query (e.g., 'photosynthesis', 'quadratic formula', 'intro to python')"),
      limit: z.number().min(1).max(30).default(10).describe("Maximum number of results to return (default: 10)"),
    },
    { title: "Search Khan Academy", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
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
            let line = `${i + 1}. **${r.title}** [${r.kind || "Unknown"}]`;
            if (r.parentPath) line += `\n   Path: ${r.parentPath}`;
            if (r.url && !r.url.includes("search_query=")) line += `\n   ${r.url}`;
            if (r.slug) line += `\n   Slug: ${r.slug}`;
            if (r.description) line += `\n   ${r.description}`;
            return line;
          })
          .join("\n\n");

        let text = `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}":\n\n${formatted}`;
        text += `\n\n---\nUse \`get_topic_tree\` with a parent subject slug to find content, or \`get_content\` / \`get_article\` / \`get_transcript\` with a content slug to get full details.`;

        return {
          content: [
            {
              type: "text" as const,
              text,
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
