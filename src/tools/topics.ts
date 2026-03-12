import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";

export function registerTopicTools(server: McpServer, client: KhanClient) {
  // ─── list_subjects ───────────────────────────────────────────────
  server.tool(
    "list_subjects",
    "List all top-level Khan Academy subjects and popular courses. Returns subject names, slugs, and descriptions. Use this as a starting point to explore Khan Academy's content.",
    {},
    async () => {
      try {
        const subjects = await client.listSubjects();

        // Group by category (stored in description field)
        const categories = new Map<string, typeof subjects>();
        for (const s of subjects) {
          const cat = s.description || "Other";
          if (!categories.has(cat)) categories.set(cat, []);
          categories.get(cat)!.push(s);
        }

        let text = "## Khan Academy Subjects & Courses\n";

        for (const [category, items] of categories) {
          text += `\n### ${category}\n`;
          for (const s of items) {
            text += `- **${s.title}** (\`${s.slug}\`)\n`;
          }
        }

        text += "\nUse `get_topic_tree` with a slug to explore subtopics, or `search` to find specific content.";

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing subjects: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── get_topic_tree ──────────────────────────────────────────────
  server.tool(
    "get_topic_tree",
    "Browse Khan Academy's subject/topic hierarchy. Given a topic slug, returns its subtopics and content items. Use `list_subjects` first to get valid slugs, then drill down.",
    {
      slug: z.string().describe("Topic slug or URL (e.g., 'math', 'science/biology', 'math/algebra')"),
      depth: z
        .number()
        .min(0)
        .max(3)
        .default(1)
        .describe("How many levels deep to fetch (0=this topic only, 1=immediate children, max 3)"),
    },
    async ({ slug, depth }) => {
      try {
        const topic = await client.getTopicTree(slug, depth);

        if (!topic) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Topic "${slug}" not found. Use \`list_subjects\` to see available subjects, or \`search\` to find content.`,
              },
            ],
          };
        }

        let text = `## ${topic.title}\n`;
        if (topic.description) text += `${topic.description}\n`;
        text += `**URL:** ${topic.url}\n`;

        if (topic.children?.length) {
          text += `\n### Subtopics (${topic.children.length})\n`;
          for (const child of topic.children) {
            text += `- **${child.title}** (\`${child.slug}\`) — ${child.kind}`;
            if (child.description) text += `\n  ${child.description}`;
            text += "\n";

            // Show nested children if depth > 1
            if (child.children?.length) {
              for (const grandchild of child.children) {
                text += `  - ${grandchild.title} (\`${grandchild.slug}\`)\n`;
              }
            }
          }
        }

        if (topic.contentItems?.length) {
          text += `\n### Content Items (${topic.contentItems.length})\n`;
          for (const item of topic.contentItems) {
            text += `- **${item.title}** [${item.kind}] — ${item.url}\n`;
          }
        }

        if (!topic.children?.length && !topic.contentItems?.length) {
          text += "\nNo subtopics or content items found at this level. Try a different slug or use `search`.";
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching topic tree: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
