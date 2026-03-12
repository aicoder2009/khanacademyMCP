#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KhanClient } from "./khan-api/client.js";
import { registerSearchTool } from "./tools/search.js";
import { registerTopicTools } from "./tools/topics.js";
import { registerContentTools } from "./tools/content.js";
import { registerTranscriptTool } from "./tools/transcript.js";
import { registerArticleTool } from "./tools/article.js";
import { registerLessonTool } from "./tools/lesson.js";
import { registerStudyGuideTool } from "./tools/study.js";
import { registerVideoTool } from "./tools/video.js";
import { registerExerciseTool } from "./tools/exercise.js";
import { registerQuizTool } from "./tools/quiz.js";

const server = new McpServer(
  {
    name: "khanacademy-mcp",
    title: "Khan Academy",
    description:
      "Access Khan Academy's vast educational library — search courses, browse topics, read articles, watch video transcripts, explore lessons, and generate study guides.",
    version: "1.0.0",
    icons: [
      {
        src: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0Ij4KICA8IS0tIEdyZWVuIGhleGFnb24gYmFja2dyb3VuZCAtLT4KICA8cG9seWdvbiBwb2ludHM9IjMyLDIgNTgsMTcgNTgsNDcgMzIsNjIgNiw0NyA2LDE3IiBmaWxsPSIjMTRCRjk2Ii8+CiAgPCEtLSBXaGl0ZSBoZWFkIChjaXJjbGUpIC0tPgogIDxjaXJjbGUgY3g9IjMyIiBjeT0iMjIiIHI9IjYiIGZpbGw9IiNGRkZGRkYiLz4KICA8IS0tIFdoaXRlIGJvZHkgLyBsZWFmLXBlcnNvbiBmaWd1cmUgLS0+CiAgPHBhdGggZD0iTTMyLDMwIEMzMiwzMCAyMiwzNCAyMCw0MiBDMTgsNTAgMjYsNTIgMzIsNDYgQzM4LDUyIDQ2LDUwIDQ0LDQyIEM0MiwzNCAzMiwzMCAzMiwzMFoiIGZpbGw9IiNGRkZGRkYiLz4KPC9zdmc+Cg==",
        mimeType: "image/svg+xml",
      },
    ],
  },
  {
    instructions: `You are connected to the Khan Academy MCP server, which provides access to Khan Academy's extensive educational content library. Use the following tools to help users learn, explore topics, and study effectively.

## Available Tools

### Discovery & Search
- **search** — Search Khan Academy for videos, articles, exercises, and courses. Start here when a user asks about any topic. Pass a descriptive query and an optional limit (default 10, max 30).
- **list_subjects** — List all top-level Khan Academy subjects and popular courses. Use this when a user wants to browse what is available or needs a starting point.

### Browsing & Navigation
- **get_topic_tree** — Browse the subject/topic hierarchy by slug. Provide a slug from \`list_subjects\` or a previous result and an optional depth (0-3). Great for drilling into a subject area step by step.
- **get_course** — Get the full structure of a Khan Academy course including units, lessons, and content items. Use when a user wants an overview of an entire course.

### Content Retrieval
- **get_content** — Get detailed metadata about a specific content item (video, article, or exercise) by slug or URL. Returns title, description, type, duration, authors, and links.
- **get_transcript** — Retrieve the transcript of a Khan Academy video. Supports full text, timestamped, or both formats. Accepts KA slugs, KA URLs, YouTube URLs, or YouTube IDs. Specify a language code if the user needs a non-English transcript.
- **get_article** — Fetch the full text content of a Khan Academy article by its slug or URL. Use this when a user asks to read or summarize an article.
- **get_lesson** — Get the full details of a lesson within a course, including all content items, descriptions, and ordering. Use when a user wants to work through a specific lesson.
- **embed_video** — Embed a Khan Academy video into the conversation with its YouTube thumbnail image, full metadata (title, description, duration, chapters), and optionally the complete transcript. Use this when you want to visually present a video or need the thumbnail for context.

### Practice & Assessment
- **get_exercise** — Get detailed information about a specific Khan Academy exercise, including its practice URL, related videos/articles to study first, and course placement. Use when a student wants to practice a skill.
- **get_quiz** — List all quizzes, unit tests, and the course challenge for a course. Returns question counts, time estimates, covered lessons, and related exercises. Filter by type: 'quiz', 'unit-test', 'course-challenge', or 'all'. Use when a student wants to prepare for assessments.

### Study & Review
- **study_guide** — Generate a structured study guide for a given topic slug. Aggregates key concepts, vocabulary, practice exercises, and video references into one convenient overview. Ideal when a user is preparing for a test or wants a summary of a unit.

## Recommended Workflows
1. **Topic exploration:** \`list_subjects\` -> \`get_topic_tree\` -> \`get_course\` -> \`get_lesson\` -> \`get_content\` / \`get_transcript\`
2. **Quick lookup:** \`search\` -> \`get_content\` or \`get_article\` -> \`get_transcript\` (if video)
3. **Study session:** \`search\` or \`get_topic_tree\` -> \`study_guide\` for review, then \`get_article\` / \`get_transcript\` for deep dives
4. **Course overview:** \`get_course\` -> pick a unit/lesson -> \`get_lesson\` -> \`get_content\`
5. **Test prep:** \`get_quiz\` to see all assessments -> \`get_exercise\` for practice -> \`get_transcript\` / \`get_article\` to review weak areas

Always prefer linking users to the Khan Academy URL so they can practice exercises and watch videos directly on the platform.`,
  }
);

const client = new KhanClient();

// Register all tools
registerSearchTool(server, client);
registerTopicTools(server, client);
registerContentTools(server, client);
registerTranscriptTool(server, client);
registerArticleTool(server, client);
registerLessonTool(server, client);
registerStudyGuideTool(server, client);
registerVideoTool(server, client);
registerExerciseTool(server, client);
registerQuizTool(server, client);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Khan Academy MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
