import { KhanApiError } from "../khan-api/errors.js";

interface ToolErrorResult {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
  [key: string]: unknown;
}

/**
 * Format a caught error as a tool result, distinguishing "Khan Academy is
 * unreachable" (temporary — retry) from unexpected internal errors. "Not found"
 * cases never reach here; client methods return null for those.
 */
export function toolErrorResult(error: unknown, activity: string): ToolErrorResult {
  let text: string;
  if (error instanceof KhanApiError) {
    const lead =
      error.reason === "rate_limited"
        ? "Khan Academy is rate-limiting requests"
        : error.reason === "timeout"
          ? "The request to Khan Academy timed out"
          : "Khan Academy could not be reached";
    text =
      `${lead} while ${activity} (${error.message}). ` +
      `This is a temporary service issue, not a problem with the requested content — wait a moment and try again.`;
  } else {
    text = `Unexpected error while ${activity}: ${error instanceof Error ? error.message : "Unknown error"}`;
  }

  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}
