import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";
import { formatDuration } from "../khan-api/parser.js";

export function registerVideoTool(server: McpServer, client: KhanClient) {
  server.tool(
    "embed_video",
    "Embed a Khan Academy video into the conversation with its thumbnail image, metadata (title, description, duration, chapters), and optionally the full transcript. Returns a visual thumbnail plus rich text context — ideal when you need to see and discuss a specific video.",
    {
      slug: z
        .string()
        .describe(
          "Video slug, KA URL, YouTube URL, or YouTube video ID (e.g., 'science/ap-biology/.../v/hydrogen-bonding-in-water', 'https://www.youtube.com/watch?v=6G1evL7ELwE')"
        ),
      include_transcript: z
        .boolean()
        .default(false)
        .describe("Include the full video transcript in the response (default: false)"),
      language: z
        .string()
        .default("en")
        .describe("Language code for transcript if included (default: 'en')"),
    },
    {
      title: "Embed Video",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ slug, include_transcript, language }) => {
      try {
        // Fetch video metadata
        const content = await client.getContent(slug);

        if (!content) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Video not found for "${slug}". Check the slug/URL and try again. Use \`search\` to find videos.`,
              },
            ],
          };
        }

        if (!content.youtubeId && content.kind !== "Video") {
          return {
            content: [
              {
                type: "text" as const,
                text: `"${content.title}" is a ${content.kind}, not a video. Use \`get_content\` or \`get_article\` instead.`,
              },
            ],
          };
        }

        const contentBlocks: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [];

        // Fetch YouTube thumbnail as base64 image
        if (content.youtubeId) {
          const thumbnail = await client.fetchVideoThumbnail(content.youtubeId);
          if (thumbnail) {
            contentBlocks.push({
              type: "image" as const,
              data: thumbnail.data,
              mimeType: thumbnail.mimeType,
            });
          }
        }

        // Build metadata text
        let text = `## ${content.title}\n`;
        text += `**Type:** Video\n`;
        text += `**URL:** ${content.kaUrl}\n`;

        if (content.youtubeId) {
          text += `**YouTube:** https://www.youtube.com/watch?v=${content.youtubeId}\n`;
        }

        if (content.duration) {
          text += `**Duration:** ${formatDuration(content.duration)}\n`;
        }

        if (content.authorNames?.length) {
          text += `**Authors:** ${content.authorNames.join(", ")}\n`;
        }

        if (content.dateAdded) {
          text += `**Date Added:** ${content.dateAdded}\n`;
        }

        if (content.description) {
          text += `\n${content.description}\n`;
        }

        if (content.keyMoments?.length) {
          text += `\n### Chapters\n`;
          for (const km of content.keyMoments) {
            text += `- [${formatDuration(km.startOffset)}] ${km.label}\n`;
          }
        }

        contentBlocks.push({ type: "text" as const, text });

        // Optionally include transcript
        if (include_transcript) {
          const transcript = await client.getTranscript(slug, language);
          if (transcript) {
            let transcriptText = `\n### Transcript\n`;
            transcriptText += `**Language:** ${transcript.language} | **Segments:** ${transcript.entries.length}\n\n`;
            transcriptText += transcript.fullText;
            contentBlocks.push({ type: "text" as const, text: transcriptText });
          } else {
            contentBlocks.push({
              type: "text" as const,
              text: `\n*Transcript not available for this video.*`,
            });
          }
        }

        return { content: contentBlocks };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error embedding video: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
