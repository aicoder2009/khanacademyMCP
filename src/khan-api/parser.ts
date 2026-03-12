import { ContentKind } from "./types.js";

const KA_BASE = "https://www.khanacademy.org";

/**
 * Normalize a Khan Academy URL or slug to a clean slug path.
 * Handles full URLs, relative paths, and plain slugs.
 */
export function normalizeSlug(input: string): string {
  let slug = input.trim();

  // Strip full URL prefix
  if (slug.startsWith("http")) {
    try {
      const url = new URL(slug);
      slug = url.pathname;
    } catch {
      // Not a valid URL, treat as slug
    }
  }

  // Remove leading/trailing slashes
  slug = slug.replace(/^\/+|\/+$/g, "");

  return slug;
}

/**
 * Build a full Khan Academy URL from a slug.
 */
export function buildKAUrl(slug: string): string {
  const normalized = normalizeSlug(slug);
  return `${KA_BASE}/${normalized}`;
}

/**
 * Detect content kind from URL path patterns.
 */
export function detectContentKind(urlOrSlug: string): ContentKind {
  const slug = normalizeSlug(urlOrSlug);

  if (slug.includes("/v/") || slug.includes("/video/")) return "Video";
  if (slug.includes("/a/") || slug.includes("/article/")) return "Article";
  if (slug.includes("/e/") || slug.includes("/exercise/")) return "Exercise";
  if (slug.includes("/interactive/")) return "Interactive";
  if (slug.includes("/challenge/")) return "Challenge";
  if (slug.includes("/talkthrough/")) return "Talkthrough";
  if (slug.includes("/project/")) return "Project";

  return "Unknown";
}

/**
 * Extract YouTube video ID from a Khan Academy video page's metadata or URL.
 */
export function extractYouTubeId(input: string): string | null {
  // Direct YouTube URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube_id["']\s*:\s*["']([a-zA-Z0-9_-]{11})["']/,
    /"youtubeId"\s*:\s*"([a-zA-Z0-9_-]{11})"/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Parse a GraphQL response and extract the data at a given path.
 */
export function extractGraphQLData<T>(
  response: { data?: Record<string, unknown>; errors?: Array<{ message: string }> },
  path: string
): T | null {
  if (response.errors?.length) {
    console.error("GraphQL errors:", response.errors);
  }

  if (!response.data) return null;

  const parts = path.split(".");
  let current: unknown = response.data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }

  return current as T;
}

/**
 * Format duration in seconds to a human-readable string.
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 60) {
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h ${remainMins}m`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
