import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";

export function registerLessonTool(server: McpServer, client: KhanClient) {
  server.tool(
    "get_lesson",
    "Get all content items in a specific Khan Academy lesson — videos, articles, and exercises. Shows what to study in a lesson with content types and URLs. Use this to see everything in a single lesson.",
    {
      slug: z.string().describe("Lesson slug or full URL (e.g., 'math/algebra/x2f8bb11595b61c86:foundation-algebra/x2f8bb11595b61c86:intro-to-variables')"),
    },
    { title: "Get Lesson Contents", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ slug }) => {
      try {
        const lesson = await client.getLesson(slug);
        if (!lesson) {
          return {
            content: [{
              type: "text" as const,
              text: `Lesson not found for "${slug}". Use \`get_course\` to see lessons within a course, or \`search\` to find content.`,
            }],
          };
        }

        let text = `## ${lesson.title}\n`;
        text += `**URL:** ${lesson.url}\n`;
        if (lesson.courseTitle) text += `**Course:** ${lesson.courseTitle}\n`;
        if (lesson.unitTitle) text += `**Unit:** ${lesson.unitTitle}\n`;
        if (lesson.description) text += `\n${lesson.description}\n`;

        text += `\n### Content (${lesson.contentItems.length} items)`;
        if (lesson.videos > 0) text += ` | ${lesson.videos} video${lesson.videos > 1 ? 's' : ''}`;
        if (lesson.articles > 0) text += ` | ${lesson.articles} article${lesson.articles > 1 ? 's' : ''}`;
        if (lesson.exercises > 0) text += ` | ${lesson.exercises} exercise${lesson.exercises > 1 ? 's' : ''}`;
        text += '\n\n';

        for (const item of lesson.contentItems) {
          text += `- **${item.title}** [${item.kind}]`;
          if (item.url) text += ` — ${item.url}`;
          text += '\n';
        }

        text += `\nUse \`get_content\`, \`get_article\`, or \`get_transcript\` with an item's slug for full details.`;

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error fetching lesson: ${error instanceof Error ? error.message : "Unknown error"}`,
          }],
          isError: true,
        };
      }
    }
  );
}
