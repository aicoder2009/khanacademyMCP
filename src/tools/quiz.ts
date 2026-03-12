import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KhanClient } from "../khan-api/client.js";

export function registerQuizTool(server: McpServer, client: KhanClient) {
  server.tool(
    "get_quiz",
    "List all quizzes, unit tests, and the course challenge for a Khan Academy course. Returns each assessment's title, question count, time estimate, covered lessons, and related exercises to practice. Use this when a student wants to prepare for or review assessments in a course.",
    {
      slug: z
        .string()
        .describe(
          "Course slug or URL (e.g., 'math/algebra', 'science/ap-biology')"
        ),
      kind: z
        .enum(["all", "quiz", "unit-test", "course-challenge"])
        .default("all")
        .describe("Filter by assessment type: 'all', 'quiz', 'unit-test', or 'course-challenge' (default: 'all')"),
    },
    {
      title: "Get Quizzes & Tests",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ slug, kind }) => {
      try {
        let quizzes = await client.getQuizzes(slug);

        if (quizzes.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No quizzes or tests found for "${slug}". Make sure this is a valid course slug. Use \`list_subjects\` or \`search\` to find courses.`,
              },
            ],
          };
        }

        // Filter by kind
        if (kind !== "all") {
          const kindMap: Record<string, string> = {
            "quiz": "Quiz",
            "unit-test": "UnitTest",
            "course-challenge": "CourseChallenge",
          };
          const filterKind = kindMap[kind];
          quizzes = quizzes.filter((q) => q.kind === filterKind);
        }

        if (quizzes.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No ${kind} assessments found for "${slug}".`,
              },
            ],
          };
        }

        const courseTitle = quizzes[0].courseTitle ?? slug;
        let text = `## Assessments: ${courseTitle}\n`;

        const quizCount = quizzes.filter((q) => q.kind === "Quiz").length;
        const unitTestCount = quizzes.filter((q) => q.kind === "UnitTest").length;
        const ccCount = quizzes.filter((q) => q.kind === "CourseChallenge").length;

        const parts: string[] = [];
        if (quizCount > 0) parts.push(`${quizCount} quiz${quizCount === 1 ? "" : "zes"}`);
        if (unitTestCount > 0) parts.push(`${unitTestCount} unit test${unitTestCount === 1 ? "" : "s"}`);
        if (ccCount > 0) parts.push(`${ccCount} course challenge`);
        text += `*${parts.join(", ")}*\n`;

        // Group by unit
        let currentUnit = "";
        for (const quiz of quizzes) {
          if (quiz.unitTitle && quiz.unitTitle !== currentUnit) {
            currentUnit = quiz.unitTitle;
            text += `\n### ${currentUnit}\n`;
          }

          if (quiz.kind === "CourseChallenge") {
            text += `\n### Course Challenge\n`;
          }

          const kindLabel =
            quiz.kind === "Quiz" ? "Quiz" :
            quiz.kind === "UnitTest" ? "Unit Test" :
            "Course Challenge";

          text += `\n**${quiz.title}** [${kindLabel}]\n`;

          if (quiz.exerciseLength > 0) {
            text += `- Questions: ${quiz.exerciseLength}\n`;
          }

          if (quiz.timeEstimate) {
            text += `- Time: ${quiz.timeEstimate.lowerBound}–${quiz.timeEstimate.upperBound} minutes\n`;
          }

          if (quiz.url) {
            text += `- URL: ${quiz.url}\n`;
          }

          if (quiz.description) {
            text += `- ${quiz.description}\n`;
          }

          if (quiz.coveredLessons.length > 0) {
            text += `- **Covers ${quiz.coveredLessons.length} lesson${quiz.coveredLessons.length === 1 ? "" : "s"}:**\n`;
            for (const lesson of quiz.coveredLessons) {
              text += `  - ${lesson.title}\n`;
            }
          }

          if (quiz.relatedExercises.length > 0) {
            text += `- **Practice exercises (${quiz.relatedExercises.length}):**\n`;
            for (const ex of quiz.relatedExercises) {
              text += `  - ${ex.title} — ${ex.url}\n`;
            }
          }
        }

        text += `\n---\n`;
        text += `Use \`get_exercise\` to see details and study material for any exercise.\n`;
        text += `Use \`get_lesson\` to explore the content of any covered lesson.\n`;
        text += `Use \`study_guide\` with a topic name for a structured study plan.`;

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching quizzes: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
