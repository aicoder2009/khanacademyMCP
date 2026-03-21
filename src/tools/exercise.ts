import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";

export function registerExerciseTool(server: McpServer, client: KhanClient) {
  server.tool(
    "get_exercise",
    "Get details about a Khan Academy exercise, including its practice URL, related lesson content (videos and articles to study first), and where it fits in the course. Use this when a student wants to practice a specific skill or prepare for an exercise.",
    {
      slug: z
        .string()
        .describe(
          "Exercise slug or full URL (e.g., 'math/algebra/.../e/linear-equations-1', or a full KA URL containing '/e/')"
        ),
    },
    {
      title: "Get Exercise",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ slug }) => {
      try {
        const exercise = await client.getExercise(slug);

        if (!exercise) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Exercise not found for "${slug}". Check the slug/URL and try again. Use \`search\` to find exercises.`,
              },
            ],
          };
        }

        let text = `## ${exercise.title}\n`;
        text += `**Type:** Exercise\n`;
        text += `**Practice URL:** ${exercise.url}\n`;

        if (exercise.courseTitle) {
          let path = exercise.courseTitle;
          if (exercise.unitTitle) path += ` > ${exercise.unitTitle}`;
          if (exercise.lessonTitle) path += ` > ${exercise.lessonTitle}`;
          text += `**Course Path:** ${path}\n`;
        }

        if (exercise.exerciseLength) {
          text += `**Questions:** ${exercise.exerciseLength}\n`;
        }

        if (exercise.timeEstimate) {
          text += `**Time Estimate:** ${exercise.timeEstimate.lowerBound}–${exercise.timeEstimate.upperBound} minutes\n`;
        }

        if (exercise.problemTypeKind) {
          text += `**Problem Type:** ${exercise.problemTypeKind}\n`;
        }

        if (exercise.description) {
          text += `\n${exercise.description}\n`;
        }

        // Show related content from the same lesson
        if (exercise.relatedContent.length > 0) {
          const videos = exercise.relatedContent.filter((c) => c.kind === "Video");
          const articles = exercise.relatedContent.filter((c) => c.kind === "Article");
          const other = exercise.relatedContent.filter(
            (c) => c.kind !== "Video" && c.kind !== "Article"
          );

          text += `\n### Study Before Practicing\n`;

          if (videos.length > 0) {
            text += `\n**Videos to watch first:**\n`;
            for (const v of videos) {
              text += `- ${v.title} — ${v.url}\n`;
            }
          }

          if (articles.length > 0) {
            text += `\n**Articles to read:**\n`;
            for (const a of articles) {
              text += `- ${a.title} — ${a.url}\n`;
            }
          }

          if (other.length > 0) {
            text += `\n**Other resources:**\n`;
            for (const o of other) {
              text += `- ${o.title} [${o.kind}] — ${o.url}\n`;
            }
          }
        }

        text += `\n---\n`;
        text += `Use \`get_transcript\` to watch related videos, or \`get_article\` to read related articles before practicing.\n`;
        text += `Open ${exercise.url} on Khan Academy to start practicing.`;

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching exercise: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
