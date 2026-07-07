import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";
import { toolErrorResult } from "./errors.js";

export function registerSearchTool(server: McpServer, client: KhanClient) {
  server.tool(
    "search",
    "Search Khan Academy's library for videos, articles, exercises, and courses by keyword. Returns titles, types, parent topic paths, and URLs. Use this when looking for specific content or topics.",
    {
      query: z.string().describe("Search query (e.g., 'photosynthesis', 'quadratic formula', 'intro to python')"),
      limit: z.number().int().min(1).max(30).default(10).describe("Maximum number of results to return (default: 10)"),
      kind: z.enum(["all", "video", "article", "exercise"]).default("all").describe("Filter results by content type (default: 'all')"),
    },
    { title: "Search Khan Academy", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ query, limit, kind }) => {
      try {
        // Over-fetch when filtering by kind so the filtered list can still fill the limit
        const fetchLimit = kind === "all" ? limit : Math.min(limit * 3, 30);
        let results = await client.search(query, fetchLimit);
        if (kind !== "all") {
          results = results.filter((r) => r.kind.toLowerCase() === kind).slice(0, limit);
        }

        if (results.length === 0) {
          const kindNote = kind === "all" ? "" : ` of type "${kind}"`;
          return {
            content: [
              {
                type: "text" as const,
                text: `No results found for "${query}"${kindNote}. Try a different search term${kind === "all" ? "" : ", or retry with kind: 'all'"}.`,
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
        if (results.some((result) => result.slug)) {
          text += `\n\n---\nUse \`get_topic_tree\` with a parent subject slug to find content, or \`get_content\` / \`get_article\` / \`get_transcript\` with a content slug to get full details.`;
        } else {
          text += `\n\n---\nKhan Academy's search API did not expose drill-down slugs for these results. Use the titles and parent paths to navigate with \`get_topic_tree\` or \`get_course\`.`;
        }

        return {
          content: [
            {
              type: "text" as const,
              text,
            },
          ],
        };
      } catch (error) {
        return toolErrorResult(error, "searching Khan Academy");
      }
    }
  );
}
