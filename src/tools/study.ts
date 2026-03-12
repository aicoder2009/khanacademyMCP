import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";
import { formatDuration } from "../khan-api/parser.js";

export function registerStudyGuideTool(server: McpServer, client: KhanClient) {
  server.tool(
    "study_guide",
    "Build a structured study guide for any topic using Khan Academy content. Searches for relevant videos, articles, and exercises, then organizes them into a learning plan. Use this when a student wants to learn a topic and needs a curated set of resources.",
    {
      topic: z.string().describe("Topic or concept to study (e.g., 'quadratic equations', 'photosynthesis', 'supply and demand')"),
      depth: z.enum(["quick", "standard", "comprehensive"]).default("standard").describe("How thorough: 'quick' (top 5), 'standard' (top 10 + details), 'comprehensive' (top 15 + details)"),
    },
    { title: "Study Guide", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async ({ topic, depth }) => {
      try {
        const limits = { quick: 5, standard: 10, comprehensive: 15 };
        const detailLimits = { quick: 0, standard: 3, comprehensive: 5 };
        const searchLimit = limits[depth];
        const detailLimit = detailLimits[depth];

        const results = await client.search(topic, searchLimit);

        if (results.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No Khan Academy content found for "${topic}". Try a different search term or check spelling.`,
            }],
          };
        }

        // Group by content type
        const videos = results.filter(r => r.kind === "Video");
        const articles = results.filter(r => r.kind === "Article");
        const exercises = results.filter(r => r.kind === "Exercise");
        const other = results.filter(r => !["Video", "Article", "Exercise"].includes(r.kind));

        // Fetch details for top results
        const detailed: Array<{ title: string; kind: string; duration?: number; description?: string; url: string }> = [];
        if (detailLimit > 0) {
          const topResults = results.slice(0, detailLimit);
          for (const r of topResults) {
            if (r.slug) {
              const content = await client.getContent(r.slug);
              if (content) {
                detailed.push({
                  title: content.title,
                  kind: content.kind,
                  duration: content.duration,
                  description: content.description,
                  url: content.kaUrl,
                });
              }
            }
          }
        }

        let text = `## Study Guide: ${topic}\n`;
        text += `*Found ${results.length} resources on Khan Academy*\n`;

        // Overview from best detailed result
        if (detailed.length > 0 && detailed[0].description) {
          text += `\n### Overview\n${detailed[0].description}\n`;
        }

        // Suggested learning order
        text += `\n### Suggested Learning Path\n`;
        text += `1. Watch the videos for conceptual understanding\n`;
        text += `2. Read the articles for detailed explanations\n`;
        text += `3. Practice with exercises to reinforce learning\n`;

        if (videos.length > 0) {
          text += `\n### Videos (${videos.length})\n`;
          for (const v of videos) {
            text += `- **${v.title}**`;
            const d = detailed.find(x => x.title === v.title);
            if (d?.duration) text += ` (${formatDuration(d.duration)})`;
            if (v.url) text += ` — ${v.url}`;
            if (v.parentPath) text += `\n  Path: ${v.parentPath}`;
            text += '\n';
          }
        }

        if (articles.length > 0) {
          text += `\n### Articles (${articles.length})\n`;
          for (const a of articles) {
            text += `- **${a.title}**`;
            if (a.url) text += ` — ${a.url}`;
            if (a.parentPath) text += `\n  Path: ${a.parentPath}`;
            text += '\n';
          }
        }

        if (exercises.length > 0) {
          text += `\n### Practice Exercises (${exercises.length})\n`;
          for (const e of exercises) {
            text += `- **${e.title}**`;
            if (e.url) text += ` — ${e.url}`;
            if (e.parentPath) text += `\n  Path: ${e.parentPath}`;
            text += '\n';
          }
        }

        if (other.length > 0) {
          text += `\n### Other Resources (${other.length})\n`;
          for (const o of other) {
            text += `- **${o.title}** [${o.kind}]`;
            if (o.url) text += ` — ${o.url}`;
            text += '\n';
          }
        }

        text += `\n### Next Steps\n`;
        text += `- Use \`get_transcript\` to read any video's full transcript\n`;
        text += `- Use \`get_article\` to read an article's full text\n`;
        text += `- Use \`get_content\` for detailed info on any specific item\n`;

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error building study guide: ${error instanceof Error ? error.message : "Unknown error"}`,
          }],
          isError: true,
        };
      }
    }
  );
}
