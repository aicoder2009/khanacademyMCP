import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";
import { formatDuration } from "../khan-api/parser.js";

export function registerTranscriptTool(server: McpServer, client: KhanClient) {
  server.tool(
    "get_transcript",
    "Get the transcript of a Khan Academy video. Returns timestamped text and a full-text version. Accepts a KA video slug/URL or YouTube URL/ID.",
    {
      slug: z
        .string()
        .describe(
          "Video slug, KA URL, YouTube URL, or YouTube video ID (e.g., 'math/algebra/v/intro-to-algebra', 'https://www.youtube.com/watch?v=NybHckSEQBI')"
        ),
      language: z
        .string()
        .default("en")
        .describe("Language code for the transcript (default: 'en')"),
      format: z
        .enum(["full", "timestamped", "both"])
        .default("full")
        .describe("Output format: 'full' (plain text), 'timestamped' (with timestamps), 'both' (default: 'full')"),
    },
    async ({ slug, language, format }) => {
      try {
        const transcript = await client.getTranscript(slug, language);

        if (!transcript) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Could not get transcript for "${slug}". Possible reasons:\n` +
                  `- The video may not have captions/subtitles\n` +
                  `- The slug may not point to a video\n` +
                  `- The requested language ("${language}") may not be available\n\n` +
                  `Try using \`get_content\` first to verify the video exists and has a YouTube ID.`,
              },
            ],
          };
        }

        let text = `## Transcript: ${transcript.videoTitle}\n`;
        text += `**YouTube:** https://www.youtube.com/watch?v=${transcript.youtubeId}\n`;
        text += `**Language:** ${transcript.language}\n`;
        text += `**Length:** ${transcript.entries.length} segments\n\n`;

        if (format === "full" || format === "both") {
          text += `### Full Text\n${transcript.fullText}\n`;
        }

        if (format === "timestamped" || format === "both") {
          if (format === "both") text += "\n";
          text += `### Timestamped Transcript\n`;
          for (const entry of transcript.entries) {
            text += `[${formatDuration(entry.start)}] ${entry.text}\n`;
          }
        }

        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching transcript: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
