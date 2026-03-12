import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";

export function registerArticleTool(server: McpServer, client: KhanClient) {
  server.tool(
    "get_article",
    "Read the full text content of a Khan Academy article. Returns the article's complete text with title, description, and metadata. Use this when you need to read or reference the actual content of an educational article.",
    {
      slug: z.string().describe("Article slug or full URL (e.g., 'science/biology/intro-to-biology/what-is-biology/a/what-is-biology')"),
    },
    { title: "Read Article", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ slug }) => {
      try {
        const article = await client.getArticle(slug);
        if (!article) {
          return {
            content: [{
              type: "text" as const,
              text: `Article not found for "${slug}". Make sure the slug points to an article (URLs containing '/a/' are articles). Use \`search\` to find articles.`,
            }],
          };
        }

        let text = `## ${article.title}\n`;
        text += `**URL:** ${article.url}\n`;
        if (article.authorNames?.length) {
          text += `**Authors:** ${article.authorNames.join(", ")}\n`;
        }
        if (article.description) {
          text += `\n> ${article.description}\n`;
        }
        text += `\n---\n\n${article.content}\n`;

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error fetching article: ${error instanceof Error ? error.message : "Unknown error"}`,
          }],
          isError: true,
        };
      }
    }
  );
}
