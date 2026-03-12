import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";
import { formatDuration } from "../khan-api/parser.js";

export function registerContentTools(server: McpServer, client: KhanClient) {
  // ─── get_content ─────────────────────────────────────────────────
  server.tool(
    "get_content",
    "Get details about a specific Khan Academy content item (video, article, or exercise). Accepts a slug or full URL. Returns title, description, type, and metadata.",
    {
      slug: z
        .string()
        .describe(
          "Content slug or full URL (e.g., 'math/algebra/v/intro-to-algebra', 'https://www.khanacademy.org/science/biology/a/intro-to-biology')"
        ),
    },
    async ({ slug }) => {
      try {
        const content = await client.getContent(slug);

        if (!content) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Content not found for "${slug}". Check the slug/URL and try again. Use \`search\` to find content.`,
              },
            ],
          };
        }

        let text = `## ${content.title}\n`;
        text += `**Type:** ${content.kind}\n`;
        text += `**URL:** ${content.kaUrl}\n`;

        if (content.description) {
          text += `\n${content.description}\n`;
        }

        if (content.duration) {
          text += `\n**Duration:** ${formatDuration(content.duration)}\n`;
        }

        if (content.youtubeId) {
          text += `**YouTube:** https://www.youtube.com/watch?v=${content.youtubeId}\n`;
          text += `\n*Use \`get_transcript\` with this slug to get the video transcript.*\n`;
        }

        if (content.authorNames?.length) {
          text += `**Authors:** ${content.authorNames.join(", ")}\n`;
        }

        if (content.dateAdded) {
          text += `**Date Added:** ${content.dateAdded}\n`;
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching content: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── get_course ──────────────────────────────────────────────────
  server.tool(
    "get_course",
    "Get the full structure of a Khan Academy course, including units, lessons, and content items. Use `list_subjects` or `search` to find course slugs.",
    {
      slug: z
        .string()
        .describe(
          "Course slug or URL (e.g., 'math/algebra', 'science/ap-biology', 'computing/computer-programming')"
        ),
    },
    async ({ slug }) => {
      try {
        const course = await client.getCourse(slug);

        if (!course) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Course not found for "${slug}". Use \`list_subjects\` to see available courses, or \`search\` to find one.`,
              },
            ],
          };
        }

        let text = `## ${course.title}\n`;
        if (course.description) text += `${course.description}\n`;
        text += `**URL:** ${course.url}\n`;

        if (course.units.length > 0) {
          text += `\n### Course Structure (${course.units.length} unit${course.units.length === 1 ? "" : "s"})\n`;

          for (const unit of course.units) {
            text += `\n#### ${unit.title}\n`;
            if (unit.description) text += `${unit.description}\n`;

            if (unit.lessons.length > 0) {
              for (const lesson of unit.lessons) {
                text += `- **${lesson.title}**`;
                if (lesson.contentItems.length > 0) {
                  text += ` (${lesson.contentItems.length} items)`;
                  const kinds = [...new Set(lesson.contentItems.map((i) => i.kind))];
                  text += ` [${kinds.join(", ")}]`;
                }
                text += "\n";

                // Show first few content items
                for (const item of lesson.contentItems.slice(0, 5)) {
                  text += `  - ${item.title} [${item.kind}]\n`;
                }
                if (lesson.contentItems.length > 5) {
                  text += `  - ... and ${lesson.contentItems.length - 5} more\n`;
                }
              }
            }
          }
        } else {
          text += "\nNo detailed course structure available. Use `get_topic_tree` with this slug to explore subtopics.";
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching course: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
