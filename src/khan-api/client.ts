import { TTLCache } from "../utils/cache.js";
import {
  KhanSubject,
  KhanTopic,
  KhanContent,
  KhanCourse,
  KhanUnit,
  KhanLesson,
  KhanTranscript,
  KhanTranscriptEntry,
  KhanSearchResult,
  KhanContentSummary,
  ContentKind,
  KhanArticle,
  KhanLessonDetail,
  KhanKeyMoment,
  KhanExercise,
  KhanQuiz,
} from "./types.js";
import { normalizeSlug, buildKAUrl, detectContentKind, extractYouTubeId } from "./parser.js";

const KA_GRAPHQL_URL = "https://www.khanacademy.org/api/internal/graphql";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const TOPIC_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MIN_REQUEST_INTERVAL = 500; // 500ms between requests

/** Persisted query hashes for KA's safelisted GraphQL operations. */
const GQL_HASHES: Record<string, string> = {
  getContentSearchResults: "1013100632",
  ContentForPath: "45296627",
  learnMenuTopicsQuery: "365090232",
};

/**
 * Static list of top-level Khan Academy subjects.
 * Used as fallback when the live API is unavailable.
 */
const STATIC_SUBJECTS: KhanSubject[] = [
  { slug: "math", title: "Math", description: "Arithmetic, algebra, geometry, calculus, statistics, and more" },
  { slug: "science", title: "Science", description: "Biology, chemistry, physics, and more" },
  { slug: "computing", title: "Computing", description: "Computer programming, computer science, and more" },
  { slug: "humanities", title: "Arts & Humanities", description: "Art history, grammar, music, and more" },
  { slug: "economics-finance-domain", title: "Economics", description: "Microeconomics, macroeconomics, and finance" },
  { slug: "ela", title: "Reading & Language Arts", description: "Reading comprehension, grammar, and writing" },
  { slug: "test-prep", title: "Test Prep", description: "SAT, LSAT, MCAT, and more" },
  { slug: "computing/computer-programming", title: "Computer Programming", description: "Intro to JS, HTML/CSS, SQL, and more" },
  { slug: "computing/computer-science", title: "Computer Science", description: "Algorithms, cryptography, and information theory" },
  { slug: "math/ap-calculus-ab", title: "AP Calculus AB", description: "Limits, derivatives, and integrals" },
  { slug: "math/ap-calculus-bc", title: "AP Calculus BC", description: "Advanced calculus topics" },
  { slug: "science/ap-biology", title: "AP Biology", description: "Advanced biology for AP exam prep" },
  { slug: "science/ap-chemistry-beta", title: "AP Chemistry", description: "Advanced chemistry for AP exam prep" },
  { slug: "science/ap-physics-1", title: "AP Physics 1", description: "Algebra-based physics" },
  { slug: "math/linear-algebra", title: "Linear Algebra", description: "Vectors, matrices, and linear transformations" },
  { slug: "math/multivariable-calculus", title: "Multivariable Calculus", description: "Partial derivatives, multiple integrals, and vector calculus" },
  { slug: "math/differential-equations", title: "Differential Equations", description: "First and second order differential equations" },
  { slug: "math/statistics-probability", title: "Statistics & Probability", description: "Distributions, hypothesis testing, and regression" },
  { slug: "science/organic-chemistry", title: "Organic Chemistry", description: "Structure, reactions, and synthesis" },
  { slug: "science/cosmology-and-astronomy", title: "Cosmology & Astronomy", description: "Stars, black holes, and the universe" },
];

export class KhanClient {
  private cache: TTLCache;
  private lastRequestTime = 0;

  constructor() {
    this.cache = new TTLCache(CACHE_TTL);
  }

  /** Rate-limited fetch with exponential backoff on 429. */
  private async rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < MIN_REQUEST_INTERVAL) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLast));
    }
    this.lastRequestTime = Date.now();

    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      const response = await fetch(url, options);

      if (response.status === 429 && retries < maxRetries) {
        retries++;
        const backoff = Math.pow(2, retries) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      return response;
    }

    throw new Error(`Request failed after ${maxRetries} retries`);
  }

  /**
   * Execute a persisted GraphQL query via GET with hash parameter.
   * KA's internal API uses safelisted queries identified by a DJB2 hash.
   */
  private async graphql<T>(operation: string, variables: Record<string, unknown> = {}): Promise<T | null> {
    const cacheKey = `gql:${operation}:${JSON.stringify(variables)}`;
    const cached = this.cache.get<T>(cacheKey);
    if (cached !== undefined) return cached;

    const hash = GQL_HASHES[operation];
    if (!hash) {
      console.error(`No hash for GraphQL operation: ${operation}`);
      return null;
    }

    try {
      const params = new URLSearchParams({
        hash,
        variables: JSON.stringify(variables),
      });
      const url = `${KA_GRAPHQL_URL}/${operation}?${params}`;

      const response = await this.rateLimitedFetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        console.error(`GraphQL ${operation}: ${response.status} ${response.statusText}`);
        return null;
      }

      const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors?.length) {
        console.error("GraphQL errors:", json.errors.map((e) => e.message).join(", "));
        return null;
      }

      const data = json.data ?? null;
      if (data) {
        this.cache.set(cacheKey, data, CACHE_TTL);
      }
      return data;
    } catch (error) {
      console.error(`GraphQL request error for ${operation}:`, error);
      return null;
    }
  }

  /**
   * Fetch ContentForPath — the universal endpoint for content, courses, and topics.
   */
  private async contentForPath(path: string): Promise<ContentForPathResult | null> {
    const normalizedPath = "/" + normalizeSlug(path);
    const data = await this.graphql<ContentForPathResponse>("ContentForPath", {
      path: normalizedPath,
      countryCode: "US",
    });
    return data?.contentRoute?.listedPathData ?? null;
  }

  // ─── list_subjects ───────────────────────────────────────────────

  async listSubjects(): Promise<KhanSubject[]> {
    const cacheKey = "subjects";
    const cached = this.cache.get<KhanSubject[]>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.graphql<{ learnMenuTopics: LearnMenuCategory[] }>(
        "learnMenuTopicsQuery",
        { region: "US" }
      );

      if (data?.learnMenuTopics?.length) {
        const subjects: KhanSubject[] = [];
        for (const category of data.learnMenuTopics) {
          const title = category.translatedTitle ?? "";
          for (const child of category.children ?? []) {
            if (child.nonContentLink) continue;
            subjects.push({
              slug: normalizeSlug(child.href),
              title: child.translatedTitle,
              description: title, // category name as description
            });
          }
        }
        if (subjects.length > 0) {
          this.cache.set(cacheKey, subjects, TOPIC_CACHE_TTL);
          return subjects;
        }
      }
    } catch {
      // Fall through to static
    }

    return STATIC_SUBJECTS;
  }

  // ─── get_topic_tree ──────────────────────────────────────────────

  async getTopicTree(slug: string, depth: number = 1): Promise<KhanTopic | null> {
    const normalizedSlug = normalizeSlug(slug);
    const cacheKey = `topic:${normalizedSlug}:${depth}`;
    const cached = this.cache.get<KhanTopic>(cacheKey);
    if (cached) return cached;

    // Try ContentForPath — works for courses
    try {
      const result = await this.contentForPath(normalizedSlug);
      if (result?.course) {
        const topic = this.mapCourseToTopic(result.course, normalizedSlug, depth);
        this.cache.set(cacheKey, topic, TOPIC_CACHE_TTL);
        return topic;
      }
    } catch {
      // Fall through
    }

    // Fallback: scrape the page
    return await this.scrapeTopicPage(normalizedSlug, depth);
  }

  private mapCourseToTopic(course: CourseData, slug: string, depth: number): KhanTopic {
    const topic: KhanTopic = {
      slug: course.slug ?? slug,
      title: course.translatedTitle ?? slug,
      description: course.translatedDescription ?? "",
      kind: "Course",
      url: buildKAUrl(course.relativeUrl ?? slug),
    };

    if (depth > 0 && course.unitChildren?.length) {
      topic.children = course.unitChildren.map((unit) => {
        const unitTopic: KhanTopic = {
          slug: unit.slug ?? "",
          title: unit.translatedTitle ?? "",
          description: unit.translatedDescription ?? "",
          kind: "Unit",
          url: buildKAUrl(unit.relativeUrl ?? ""),
        };

        if (depth > 1 && unit.allOrderedChildren?.length) {
          unitTopic.children = unit.allOrderedChildren.map((lesson) => ({
            slug: lesson.slug ?? "",
            title: lesson.translatedTitle ?? "",
            description: "",
            kind: "Lesson" as const,
            url: buildKAUrl(lesson.relativeUrl ?? ""),
            contentItems: this.extractLessonItems(lesson),
          }));
        }

        return unitTopic;
      });
    }

    return topic;
  }

  private extractLessonItems(lesson: UnitChildData): KhanContentSummary[] {
    if (!lesson.curatedChildren?.length) return [];
    return lesson.curatedChildren.map((item) => ({
      slug: item.slug ?? "",
      title: item.translatedTitle ?? "",
      kind: (item.contentKind as ContentKind) ?? "Unknown",
      url: buildKAUrl(item.urlWithinCurationNode ?? item.canonicalUrl ?? ""),
      description: item.translatedDescription,
    }));
  }

  private async scrapeTopicPage(slug: string, depth: number): Promise<KhanTopic | null> {
    try {
      const response = await this.rateLimitedFetch(`https://www.khanacademy.org/${slug}`, {
        headers: { Accept: "text/html" },
      });

      if (!response.ok) return null;

      const html = await response.text();

      const stateMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
      if (!stateMatch) {
        return this.parseMetaTags(html, slug);
      }

      try {
        const state = JSON.parse(stateMatch[1]);
        return this.parseApolloState(state, slug, depth);
      } catch {
        return this.parseMetaTags(html, slug);
      }
    } catch {
      return null;
    }
  }

  private parseApolloState(state: Record<string, unknown>, slug: string, depth: number): KhanTopic | null {
    const entries = Object.entries(state);
    const topicEntries = entries.filter(([key]) => key.startsWith("Topic:") || key.startsWith("Course:"));

    if (topicEntries.length === 0) return null;

    const rootEntry = topicEntries.find(([_, value]) => {
      const v = value as Record<string, unknown>;
      return v.slug === slug || (v.relativeUrl as string)?.includes(slug);
    });

    if (!rootEntry) {
      const [_, value] = topicEntries[0];
      const v = value as Record<string, unknown>;
      return {
        slug: (v.slug as string) ?? slug,
        title: (v.title as string) ?? slug,
        description: (v.description as string) ?? "",
        kind: "Topic",
        url: buildKAUrl(slug),
        children: [],
      };
    }

    const [_, value] = rootEntry;
    const v = value as Record<string, unknown>;

    const topic: KhanTopic = {
      slug: (v.slug as string) ?? slug,
      title: (v.title as string) ?? slug,
      description: (v.description as string) ?? "",
      kind: ((v.kind as string) ?? "Topic") as KhanTopic["kind"],
      url: buildKAUrl(slug),
    };

    if (depth > 0) {
      const childRefs = v.childTopics as Array<{ __ref?: string }> | undefined;
      if (childRefs) {
        topic.children = childRefs
          .map((ref) => {
            if (!ref.__ref) return null;
            const childData = state[ref.__ref] as Record<string, unknown> | undefined;
            if (!childData) return null;
            return {
              slug: (childData.slug as string) ?? "",
              title: (childData.title as string) ?? "",
              description: (childData.description as string) ?? "",
              kind: ((childData.kind as string) ?? "Topic") as KhanTopic["kind"],
              url: buildKAUrl((childData.relativeUrl as string) ?? (childData.slug as string) ?? ""),
            };
          })
          .filter((c): c is KhanTopic => c !== null);
      }
    }

    return topic;
  }

  private parseMetaTags(html: string, slug: string): KhanTopic {
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);

    return {
      slug,
      title: titleMatch?.[1]?.replace(/ \| Khan Academy$/, "").trim() ?? slug,
      description: descMatch?.[1] ?? "",
      kind: "Topic",
      url: buildKAUrl(slug),
    };
  }

  // ─── search ──────────────────────────────────────────────────────

  async search(query: string, limit: number = 10): Promise<KhanSearchResult[]> {
    const cacheKey = `search:${query}:${limit}`;
    const cached = this.cache.get<KhanSearchResult[]>(cacheKey);
    if (cached) return cached;

    // Primary: GraphQL search API
    try {
      const data = await this.graphql<SearchPageResponse>("getContentSearchResults", {
        query,
        numResults: limit,
      });

      if (data?.searchPage?.results?.length) {
        const results: KhanSearchResult[] = data.searchPage.results
          .filter((r) => r.learnableContent?.translatedTitle)
          .map((r) => {
            const lc = r.learnableContent!;
            const parentPath = this.buildParentPath(lc.parentTopic);
            const relativeUrl = lc.relativeUrl ?? r.relativeUrl ?? "";
            const slug = lc.slug ?? r.slug ?? normalizeSlug(relativeUrl);
            return {
              title: lc.translatedTitle ?? "",
              description: lc.translatedDescription ?? "",
              kind: (r.kind as ContentKind) ?? "Unknown",
              url: relativeUrl ? buildKAUrl(relativeUrl) : "",
              slug,
              parentPath,
            };
          });

        this.cache.set(cacheKey, results, CACHE_TTL);
        return results;
      }
    } catch {
      // Fall through
    }

    // Fallback: scrape search results page
    try {
      const response = await this.rateLimitedFetch(
        `https://www.khanacademy.org/search?search_query=${encodeURIComponent(query)}`,
        { headers: { Accept: "text/html" } }
      );

      if (!response.ok) return [];

      const html = await response.text();
      const results = this.parseSearchResults(html, limit);
      if (results.length) {
        this.cache.set(cacheKey, results, CACHE_TTL);
      }
      return results;
    } catch {
      return [];
    }
  }

  private buildParentPath(parentTopic?: ParentTopicData): string {
    if (!parentTopic) return "";
    const parts: string[] = [];
    let current: ParentTopicData | undefined = parentTopic;
    while (current) {
      if (current.translatedTitle) {
        parts.unshift(current.translatedTitle);
      }
      current = current.parent;
    }
    return parts.join(" > ");
  }

  private parseSearchResults(html: string, limit: number): KhanSearchResult[] {
    const results: KhanSearchResult[] = [];

    const stateMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        const entries = Object.entries(state);
        for (const [_, value] of entries) {
          if (results.length >= limit) break;
          const v = value as Record<string, unknown>;
          if (v.title && v.relativeUrl && typeof v.title === "string") {
            results.push({
              title: v.title,
              description: (v.description as string) ?? "",
              kind: (v.kind as ContentKind) ?? detectContentKind((v.relativeUrl as string) ?? ""),
              url: buildKAUrl(v.relativeUrl as string),
              slug: (v.slug as string) ?? normalizeSlug(v.relativeUrl as string),
            });
          }
        }
      } catch {
        // Ignore
      }
    }

    return results;
  }

  // ─── get_content ─────────────────────────────────────────────────

  async getContent(slugOrUrl: string): Promise<KhanContent | null> {
    const slug = normalizeSlug(slugOrUrl);
    const cacheKey = `content:${slug}`;
    const cached = this.cache.get<KhanContent>(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.contentForPath(slug);

      if (result?.content) {
        const raw = result.content;
        const content: KhanContent = {
          id: raw.id ?? slug,
          slug: raw.slug ?? raw.nodeSlug ?? slug,
          title: raw.translatedTitle ?? slug,
          kind: (raw.contentKind as ContentKind) ?? detectContentKind(raw.relativeUrl ?? slug),
          url: buildKAUrl(raw.relativeUrl ?? raw.kaUrl ?? slug),
          description: raw.translatedDescription ?? raw.description ?? "",
          thumbnailUrl: raw.imageUrl,
          youtubeId: raw.youtubeId,
          duration: raw.duration,
          authorNames: raw.authorNames,
          dateAdded: raw.dateAdded,
          kaUrl: raw.kaUrl ?? buildKAUrl(raw.relativeUrl ?? slug),
          keyMoments: raw.keyMoments,
        };
        this.cache.set(cacheKey, content, CACHE_TTL);
        return content;
      }

      // If it's a course, return basic info
      if (result?.course) {
        const c = result.course;
        const content: KhanContent = {
          id: c.id ?? slug,
          slug: c.slug ?? slug,
          title: c.translatedTitle ?? slug,
          kind: "Unknown",
          url: buildKAUrl(c.relativeUrl ?? slug),
          description: c.translatedDescription ?? "",
          thumbnailUrl: c.iconPath,
          kaUrl: buildKAUrl(c.relativeUrl ?? slug),
        };
        this.cache.set(cacheKey, content, CACHE_TTL);
        return content;
      }
    } catch {
      // Fall through
    }

    // Fallback: scrape
    return await this.scrapeContentPage(slug);
  }

  private async scrapeContentPage(slug: string): Promise<KhanContent | null> {
    try {
      const response = await this.rateLimitedFetch(`https://www.khanacademy.org/${slug}`, {
        headers: { Accept: "text/html" },
      });

      if (!response.ok) return null;

      const html = await response.text();

      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);
      const youtubeId = extractYouTubeId(html);
      const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);

      const title = titleMatch?.[1]?.replace(/ \| Khan Academy$/, "").trim() ?? slug;

      const content: KhanContent = {
        id: slug,
        slug,
        title,
        kind: detectContentKind(slug),
        url: buildKAUrl(slug),
        description: descMatch?.[1] ?? "",
        thumbnailUrl: ogImageMatch?.[1],
        youtubeId: youtubeId ?? undefined,
        kaUrl: buildKAUrl(slug),
      };

      this.cache.set(`content:${slug}`, content, CACHE_TTL);
      return content;
    } catch {
      return null;
    }
  }

  // ─── get_course ──────────────────────────────────────────────────

  async getCourse(slugOrUrl: string): Promise<KhanCourse | null> {
    const slug = normalizeSlug(slugOrUrl);
    const cacheKey = `course:${slug}`;
    const cached = this.cache.get<KhanCourse>(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.contentForPath(slug);

      if (result?.course) {
        const c = result.course;
        const course: KhanCourse = {
          slug: c.slug ?? slug,
          title: c.translatedTitle ?? slug,
          description: c.translatedDescription ?? "",
          url: buildKAUrl(c.relativeUrl ?? slug),
          units: this.mapCourseUnits(c),
        };
        this.cache.set(cacheKey, course, TOPIC_CACHE_TTL);
        return course;
      }
    } catch {
      // Fall through
    }

    // Fallback: scrape
    return await this.scrapeCourse(slug);
  }

  private mapCourseUnits(course: CourseData): KhanUnit[] {
    if (!course.unitChildren?.length) return [];

    return course.unitChildren.map((unit) => {
      const lessons: KhanLesson[] = [];

      if (unit.allOrderedChildren?.length) {
        for (const child of unit.allOrderedChildren) {
          if (!child.translatedTitle) continue;
          const contentItems: KhanContentSummary[] = [];

          if (child.curatedChildren?.length) {
            for (const item of child.curatedChildren) {
              contentItems.push({
                slug: item.slug ?? "",
                title: item.translatedTitle ?? "",
                kind: (item.contentKind as ContentKind) ?? "Unknown",
                url: buildKAUrl(item.urlWithinCurationNode ?? item.canonicalUrl ?? ""),
                description: item.translatedDescription,
              });
            }
          }

          lessons.push({
            slug: child.slug ?? "",
            title: child.translatedTitle ?? "",
            contentItems,
          });
        }
      }

      return {
        slug: unit.slug ?? "",
        title: unit.translatedTitle ?? "",
        description: unit.translatedDescription,
        lessons,
      };
    });
  }

  private async scrapeCourse(slug: string): Promise<KhanCourse | null> {
    try {
      const response = await this.rateLimitedFetch(`https://www.khanacademy.org/${slug}`, {
        headers: { Accept: "text/html" },
      });

      if (!response.ok) return null;

      const html = await response.text();
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);

      return {
        slug,
        title: titleMatch?.[1]?.replace(/ \| Khan Academy$/, "").trim() ?? slug,
        description: descMatch?.[1] ?? "",
        url: buildKAUrl(slug),
        units: [],
      };
    } catch {
      return null;
    }
  }

  // ─── get_article ─────────────────────────────────────────────────

  async getArticle(slugOrUrl: string): Promise<KhanArticle | null> {
    const slug = normalizeSlug(slugOrUrl);
    const cacheKey = `article:${slug}`;
    const cached = this.cache.get<KhanArticle>(cacheKey);
    if (cached) return cached;

    try {
      // Get metadata via ContentForPath
      const result = await this.contentForPath(slug);
      const raw = result?.content;

      // Verify it's an article
      if (!raw || !raw.contentKind?.toLowerCase().includes("article")) {
        // If not clearly an article, still attempt if slug contains /a/
        if (!slug.includes("/a/") && !slug.includes("/article/")) {
          return null;
        }
      }

      const title = raw?.translatedTitle ?? slug;
      const description = raw?.translatedDescription ?? raw?.description ?? "";
      const authorNames = raw?.authorNames;
      const dateAdded = raw?.dateAdded;
      const url = buildKAUrl(raw?.relativeUrl ?? slug);

      // Scrape the page for article content
      let content = "";
      try {
        const response = await this.rateLimitedFetch(`https://www.khanacademy.org/${slug}`, {
          headers: { Accept: "text/html" },
        });

        if (response.ok) {
          const html = await response.text();
          content = this.extractArticleContent(html);
        }
      } catch {
        // Continue with empty content
      }

      if (!content && !raw) {
        return null;
      }

      const article: KhanArticle = {
        slug,
        title,
        description,
        url,
        content: content || description,
        authorNames,
        dateAdded,
      };

      this.cache.set(cacheKey, article, CACHE_TTL);
      return article;
    } catch {
      return null;
    }
  }

  private extractArticleContent(html: string): string {
    // Try extracting from Apollo state
    const stateMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        for (const [_, value] of Object.entries(state)) {
          const v = value as Record<string, unknown>;

          // Look for Perseus content (article content stored as JSON)
          const perseusContent = v.perseusContent ?? v.articleContent;
          if (typeof perseusContent === "string" && perseusContent.length > 0) {
            try {
              const parsed = JSON.parse(perseusContent);
              if (parsed.content && typeof parsed.content === "string") {
                return this.stripHtmlAndClean(parsed.content);
              }
              // Some Perseus content has items array
              if (Array.isArray(parsed.items)) {
                return parsed.items
                  .map((item: Record<string, unknown>) => {
                    const nested = item.item as Record<string, unknown> | undefined;
                    const itemContent = item.content ?? nested?.content;
                    return typeof itemContent === "string" ? this.stripHtmlAndClean(itemContent) : "";
                  })
                  .filter(Boolean)
                  .join("\n\n");
              }
            } catch {
              // Not JSON, use as-is
              return this.stripHtmlAndClean(perseusContent);
            }
          }
        }
      } catch {
        // Fall through to other extraction methods
      }
    }

    // Fallback: extract from clearfix div or article tags
    const clearfixMatch = html.match(/<div\s+class="clearfix"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    if (clearfixMatch) {
      return this.stripHtmlAndClean(clearfixMatch[1]);
    }

    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/);
    if (articleMatch) {
      return this.stripHtmlAndClean(articleMatch[1]);
    }

    return "";
  }

  private stripHtmlAndClean(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // ─── get_lesson ─────────────────────────────────────────────────

  async getLesson(slugOrUrl: string): Promise<KhanLessonDetail | null> {
    const slug = normalizeSlug(slugOrUrl);
    const cacheKey = `lesson:${slug}`;
    const cached = this.cache.get<KhanLessonDetail>(cacheKey);
    if (cached) return cached;

    try {
      // Strategy: extract course slug from lesson path, fetch course, find lesson
      // Lesson slugs look like: math/algebra/x2f8bb11595b61c86:foundation-algebra/x2f8bb11595b61c86:intro-to-variables
      // The course is typically the first two segments
      const parts = slug.split("/");
      if (parts.length >= 2) {
        // Try progressively shorter course slugs
        for (let i = Math.min(parts.length - 1, 3); i >= 2; i--) {
          const courseSlug = parts.slice(0, i).join("/");
          const course = await this.getCourse(courseSlug);
          if (course && course.units.length > 0) {
            // Search for the matching lesson across all units
            for (const unit of course.units) {
              for (const lesson of unit.lessons) {
                // Match by slug or by checking if the full slug ends with the lesson slug
                if (
                  lesson.slug === parts[parts.length - 1] ||
                  slug.endsWith(lesson.slug) ||
                  lesson.slug === slug.split("/").pop()
                ) {
                  const contentItems = lesson.contentItems;
                  const videos = contentItems.filter((item) => item.kind === "Video").length;
                  const articles = contentItems.filter((item) => item.kind === "Article").length;
                  const exercises = contentItems.filter((item) => item.kind === "Exercise").length;

                  const detail: KhanLessonDetail = {
                    slug,
                    title: lesson.title,
                    description: "",
                    url: buildKAUrl(slug),
                    unitTitle: unit.title,
                    courseTitle: course.title,
                    contentItems,
                    videos,
                    articles,
                    exercises,
                  };

                  this.cache.set(cacheKey, detail, CACHE_TTL);
                  return detail;
                }
              }
            }
          }
        }
      }

      // Fallback: scrape the lesson page directly
      return await this.scrapeLessonPage(slug);
    } catch {
      return null;
    }
  }

  private async scrapeLessonPage(slug: string): Promise<KhanLessonDetail | null> {
    try {
      const response = await this.rateLimitedFetch(`https://www.khanacademy.org/${slug}`, {
        headers: { Accept: "text/html" },
      });

      if (!response.ok) return null;

      const html = await response.text();
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);
      const title = titleMatch?.[1]?.replace(/ \| Khan Academy$/, "").trim() ?? slug;
      const description = descMatch?.[1] ?? "";

      const contentItems: KhanContentSummary[] = [];

      // Try Apollo state for content items
      const stateMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({.+?});?\s*<\/script>/s);
      if (stateMatch) {
        try {
          const state = JSON.parse(stateMatch[1]);
          for (const [key, value] of Object.entries(state)) {
            const v = value as Record<string, unknown>;
            if (
              v.translatedTitle &&
              v.contentKind &&
              typeof v.translatedTitle === "string" &&
              typeof v.contentKind === "string" &&
              !key.startsWith("Topic:") &&
              !key.startsWith("Course:")
            ) {
              contentItems.push({
                slug: (v.slug as string) ?? "",
                title: v.translatedTitle,
                kind: (v.contentKind as ContentKind) ?? "Unknown",
                url: buildKAUrl((v.relativeUrl as string) ?? (v.canonicalUrl as string) ?? ""),
                description: (v.translatedDescription as string) ?? undefined,
              });
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      const videos = contentItems.filter((item) => item.kind === "Video").length;
      const articles = contentItems.filter((item) => item.kind === "Article").length;
      const exercises = contentItems.filter((item) => item.kind === "Exercise").length;

      const detail: KhanLessonDetail = {
        slug,
        title,
        description,
        url: buildKAUrl(slug),
        contentItems,
        videos,
        articles,
        exercises,
      };

      this.cache.set(`lesson:${slug}`, detail, CACHE_TTL);
      return detail;
    } catch {
      return null;
    }
  }

  // ─── get_exercise ───────────────────────────────────────────────

  async getExercise(slugOrUrl: string): Promise<KhanExercise | null> {
    const slug = normalizeSlug(slugOrUrl);
    const cacheKey = `exercise:${slug}`;
    const cached = this.cache.get<KhanExercise>(cacheKey);
    if (cached) return cached;

    // Get basic exercise metadata from ContentForPath
    const result = await this.contentForPath(slug);
    const raw = result?.content;

    if (!raw) return null;

    const exerciseTitle = raw.translatedTitle ?? slug;
    const exerciseSlug = raw.slug ?? slug;
    const exerciseUrl = buildKAUrl(raw.relativeUrl ?? slug);
    const description = raw.translatedDescription ?? raw.description ?? "";
    const exerciseMeta = raw as ContentData & {
      problemTypeKind?: string;
      exerciseLength?: number;
      timeEstimate?: { lowerBound: number; upperBound: number };
    };
    const problemTypeKind = exerciseMeta.problemTypeKind;

    // Try to find this exercise in its course structure for richer context
    const parts = slug.split("/");
    let relatedContent: KhanContentSummary[] = [];
    let lessonTitle: string | undefined;
    let unitTitle: string | undefined;
    let courseTitle: string | undefined;
    let exerciseLength = exerciseMeta.exerciseLength;
    let timeEstimate = exerciseMeta.timeEstimate;

    if (parts.length >= 2) {
      for (let i = Math.min(parts.length - 1, 3); i >= 2; i--) {
        const courseSlug = parts.slice(0, i).join("/");
        const courseResult = await this.contentForPath(courseSlug);
        if (courseResult?.course) {
          const course = courseResult.course;
          courseTitle = course.translatedTitle;

          // Search for the exercise in the course structure
          for (const unit of course.unitChildren ?? []) {
            for (const lesson of unit.allOrderedChildren ?? []) {
              const items = lesson.curatedChildren ?? [];
              const found = items.find(
                (item) =>
                  item.slug === exerciseSlug ||
                  item.slug === parts[parts.length - 1] ||
                  (item.canonicalUrl ?? "").includes(exerciseSlug)
              );
              if (found) {
                lessonTitle = lesson.translatedTitle;
                unitTitle = unit.translatedTitle;
                // Collect sibling content items (videos, articles in the same lesson)
                relatedContent = items
                  .filter((item) => item.slug !== found.slug)
                  .map((item) => ({
                    slug: item.slug ?? "",
                    title: item.translatedTitle ?? "",
                    kind: (item.contentKind as ContentKind) ?? "Unknown",
                    url: buildKAUrl(item.urlWithinCurationNode ?? item.canonicalUrl ?? ""),
                    description: item.translatedDescription,
                  }));
                break;
              }
            }
            if (lessonTitle) break;
          }
          if (lessonTitle) break;
        }
      }
    }

    const exercise: KhanExercise = {
      slug: exerciseSlug,
      title: exerciseTitle,
      description,
      url: exerciseUrl,
      exerciseLength,
      timeEstimate,
      problemTypeKind,
      relatedContent,
      lessonTitle,
      unitTitle,
      courseTitle,
    };

    this.cache.set(cacheKey, exercise, CACHE_TTL);
    return exercise;
  }

  // ─── get_quiz ──────────────────────────────────────────────────

  async getQuizzes(slugOrUrl: string): Promise<KhanQuiz[]> {
    const slug = normalizeSlug(slugOrUrl);
    const cacheKey = `quizzes:${slug}`;
    const cached = this.cache.get<KhanQuiz[]>(cacheKey);
    if (cached) return cached;

    const result = await this.contentForPath(slug);
    if (!result?.course) return [];

    const course = result.course;
    const courseTitle = course.translatedTitle ?? slug;
    const quizzes: KhanQuiz[] = [];

    for (const unit of course.unitChildren ?? []) {
      const unitTitle = unit.translatedTitle ?? "";
      const lessonsBeforeQuiz: Array<{ title: string; slug: string; url: string }> = [];

      for (const child of unit.allOrderedChildren ?? []) {
        const typename = (child as unknown as { __typename: string }).__typename;

        if (typename === "TopicQuiz" || typename === "TopicUnitTest") {
          const quizData = child as unknown as QuizUnitTestData;
          const kind = typename === "TopicQuiz" ? "Quiz" : "UnitTest";
          const quizUrl = buildKAUrl(
            quizData.urlWithinCurationNode ?? quizData.canonicalUrl ?? ""
          );

          // Collect exercises from covered lessons
          const relatedExercises: KhanContentSummary[] = [];
          for (const lesson of lessonsBeforeQuiz) {
            // Find lesson in course structure and get its exercises
            for (const u of course.unitChildren ?? []) {
              for (const l of u.allOrderedChildren ?? []) {
                if (l.translatedTitle === lesson.title || l.slug === lesson.slug) {
                  for (const item of l.curatedChildren ?? []) {
                    if (item.contentKind === "Exercise") {
                      relatedExercises.push({
                        slug: item.slug ?? "",
                        title: item.translatedTitle ?? "",
                        kind: "Exercise",
                        url: buildKAUrl(item.urlWithinCurationNode ?? item.canonicalUrl ?? ""),
                        description: item.translatedDescription,
                      });
                    }
                  }
                }
              }
            }
          }

          quizzes.push({
            slug: quizData.slug ?? "",
            title: quizData.translatedTitle ?? `${unitTitle}: ${kind}`,
            description: quizData.translatedDescription ?? "",
            url: quizUrl,
            kind: kind as "Quiz" | "UnitTest",
            exerciseLength: quizData.exerciseLength ?? 0,
            timeEstimate: quizData.timeEstimate,
            unitTitle,
            courseTitle,
            coveredLessons: [...lessonsBeforeQuiz],
            relatedExercises,
          });

          // Reset for next quiz (unit tests cover all lessons, quizzes cover since last quiz)
          if (typename === "TopicQuiz") {
            lessonsBeforeQuiz.length = 0;
          }
        } else {
          // It's a lesson — track it
          if (child.translatedTitle) {
            lessonsBeforeQuiz.push({
              title: child.translatedTitle,
              slug: child.slug ?? "",
              url: buildKAUrl(child.relativeUrl ?? ""),
            });
          }
        }
      }
    }

    // Add course challenge if present
    const cc = course.courseChallenge as QuizUnitTestData | undefined;
    if (cc) {
      quizzes.push({
        slug: cc.slug ?? "",
        title: `${courseTitle}: Course Challenge`,
        description: "Comprehensive assessment covering all course material.",
        url: buildKAUrl(cc.urlWithinCurationNode ?? ""),
        kind: "CourseChallenge",
        exerciseLength: cc.exerciseLength ?? 30,
        timeEstimate: cc.timeEstimate,
        courseTitle,
        coveredLessons: [],
        relatedExercises: [],
      });
    }

    this.cache.set(cacheKey, quizzes, CACHE_TTL);
    return quizzes;
  }

  // ─── video thumbnail ─────────────────────────────────────────────

  async fetchVideoThumbnail(
    youtubeId: string
  ): Promise<{ data: string; mimeType: string } | null> {
    const cacheKey = `thumb:${youtubeId}`;
    const cached = this.cache.get<{ data: string; mimeType: string }>(cacheKey);
    if (cached) return cached;

    // Try thumbnail URLs in descending quality order
    const urls = [
      `https://img.youtube.com/vi/${youtubeId}/sddefault.jpg`,
      `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
      `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`,
    ];

    for (const url of urls) {
      try {
        const response = await this.rateLimitedFetch(url);
        if (!response.ok) continue;

        const buffer = await response.arrayBuffer();
        // Skip tiny placeholder images (YouTube returns a small grey image for missing thumbnails)
        if (buffer.byteLength < 1000) continue;

        const base64 = Buffer.from(buffer).toString("base64");
        const result = { data: base64, mimeType: "image/jpeg" };
        this.cache.set(cacheKey, result, CACHE_TTL);
        return result;
      } catch {
        continue;
      }
    }

    return null;
  }

  // ─── get_transcript ──────────────────────────────────────────────

  async getTranscript(slugOrUrl: string, lang: string = "en"): Promise<KhanTranscript | null> {
    const slug = normalizeSlug(slugOrUrl);
    const cacheKey = `transcript:${slug}:${lang}`;
    const cached = this.cache.get<KhanTranscript>(cacheKey);
    if (cached) return cached;

    // Check if input is a YouTube URL — use YouTube fallback
    const directYoutubeId = extractYouTubeId(slugOrUrl);
    if (directYoutubeId) {
      const transcript = await this.fetchYouTubeTranscript(directYoutubeId, lang, slug);
      if (transcript) {
        this.cache.set(cacheKey, transcript, CACHE_TTL);
      }
      return transcript;
    }

    // Use ContentForPath which returns subtitles directly
    try {
      const result = await this.contentForPath(slug);

      if (result?.content) {
        const content = result.content;

        if (content.subtitles?.length) {
          const entries: KhanTranscriptEntry[] = content.subtitles
            .filter((s) => s.text && s.kaIsValid !== false)
            .map((s) => ({
              start: (s.startTime ?? 0) / 1000,
              duration: ((s.endTime ?? 0) - (s.startTime ?? 0)) / 1000,
              text: s.text
                .replace(/<[^>]+>/g, "")
                .replace(/\n/g, " ")
                .trim(),
            }))
            .filter((e) => e.text);

          if (entries.length > 0) {
            const transcript: KhanTranscript = {
              videoTitle: content.translatedTitle ?? slug,
              youtubeId: content.youtubeId ?? "",
              language: content.translatedYoutubeLang ?? lang,
              entries,
              fullText: entries.map((e) => e.text).join(" "),
            };
            this.cache.set(cacheKey, transcript, CACHE_TTL);
            return transcript;
          }
        }

        // If no subtitles in API response, try YouTube as fallback
        if (content.youtubeId) {
          const transcript = await this.fetchYouTubeTranscript(
            content.youtubeId,
            lang,
            content.translatedTitle ?? slug
          );
          if (transcript) {
            this.cache.set(cacheKey, transcript, CACHE_TTL);
          }
          return transcript;
        }
      }
    } catch {
      // Fall through
    }

    return null;
  }

  private async fetchYouTubeTranscript(
    youtubeId: string,
    lang: string,
    videoTitle: string
  ): Promise<KhanTranscript | null> {
    try {
      const videoPageResponse = await this.rateLimitedFetch(
        `https://www.youtube.com/watch?v=${youtubeId}`,
        {
          headers: {
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        }
      );

      if (!videoPageResponse.ok) return null;

      const html = await videoPageResponse.text();

      const captionTrackMatch = html.match(/"captionTracks":\s*(\[.+?\])/);
      if (!captionTrackMatch) return null;

      const tracks = JSON.parse(captionTrackMatch[1]) as Array<{
        baseUrl: string;
        languageCode: string;
      }>;

      const track = tracks.find((t) => t.languageCode === lang) ?? tracks[0];
      if (!track) return null;

      const captionUrl = track.baseUrl.replace(/\\u0026/g, "&");
      const captionResponse = await this.rateLimitedFetch(captionUrl);
      if (!captionResponse.ok) return null;

      const xml = await captionResponse.text();
      return this.parseTranscriptXml(xml, youtubeId, track.languageCode, videoTitle);
    } catch {
      return null;
    }
  }

  private parseTranscriptXml(
    xml: string,
    youtubeId: string,
    language: string,
    videoTitle: string
  ): KhanTranscript | null {
    const entries: KhanTranscriptEntry[] = [];

    const textRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
    let match;

    while ((match = textRegex.exec(xml)) !== null) {
      const start = parseFloat(match[1]);
      const duration = parseFloat(match[2]);
      const text = match[3]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/\n/g, " ")
        .trim();

      if (text) {
        entries.push({ start, duration, text });
      }
    }

    if (entries.length === 0) return null;

    return {
      videoTitle,
      youtubeId,
      language,
      entries,
      fullText: entries.map((e) => e.text).join(" "),
    };
  }
}

// ─── GraphQL response types ──────────────────────────────────────

interface ContentForPathResponse {
  contentRoute: {
    listedPathData: ContentForPathResult | null;
  };
}

interface ContentForPathResult {
  content: ContentData | null;
  course: CourseData | null;
  lesson: unknown;
}

interface ContentData {
  __typename: string;
  id?: string;
  slug?: string;
  nodeSlug?: string;
  readableId?: string;
  translatedTitle?: string;
  translatedDescription?: string;
  description?: string;
  contentKind?: string;
  relativeUrl?: string;
  kaUrl?: string;
  imageUrl?: string;
  youtubeId?: string;
  translatedYoutubeId?: string;
  translatedYoutubeLang?: string;
  duration?: number;
  authorNames?: string[];
  dateAdded?: string;
  subtitles?: SubtitleEntry[];
  keyMoments?: Array<{ label: string; startOffset: number; endOffset: number }>;
}

interface SubtitleEntry {
  text: string;
  startTime?: number;
  endTime?: number;
  kaIsValid?: boolean;
}

interface CourseData {
  __typename: string;
  id?: string;
  slug?: string;
  translatedTitle?: string;
  translatedDescription?: string;
  relativeUrl?: string;
  iconPath?: string;
  unitChildren?: UnitData[];
  courseChallenge?: QuizUnitTestData;
}

interface UnitData {
  __typename: string;
  slug?: string;
  translatedTitle?: string;
  translatedDescription?: string;
  relativeUrl?: string;
  allOrderedChildren?: UnitChildData[];
}

interface UnitChildData {
  __typename: string;
  slug?: string;
  translatedTitle?: string;
  relativeUrl?: string;
  curatedChildren?: CuratedChildData[];
}

interface CuratedChildData {
  __typename: string;
  slug?: string;
  translatedTitle?: string;
  translatedDescription?: string;
  contentKind?: string;
  canonicalUrl?: string;
  urlWithinCurationNode?: string;
}

interface SearchPageResponse {
  searchPage: {
    results: SearchResultData[];
  };
}

interface SearchResultData {
  contentId: string;
  kind: string;
  relativeUrl?: string;
  slug?: string;
  learnableContent?: {
    translatedTitle?: string;
    translatedDescription?: string;
    relativeUrl?: string;
    slug?: string;
    parentTopic?: ParentTopicData;
  };
}

interface ParentTopicData {
  translatedTitle?: string;
  contentKind?: string;
  parent?: ParentTopicData;
}

interface QuizUnitTestData {
  __typename?: string;
  slug?: string;
  translatedTitle?: string;
  translatedDescription?: string;
  contentKind?: string;
  exerciseLength?: number;
  timeEstimate?: { lowerBound: number; upperBound: number };
  canonicalUrl?: string;
  urlWithinCurationNode?: string;
  contentDescriptor?: string;
  progressKey?: string;
}

interface LearnMenuCategory {
  translatedTitle?: string;
  children?: LearnMenuChild[];
}

interface LearnMenuChild {
  href: string;
  slug: string;
  translatedTitle: string;
  nonContentLink?: boolean;
}
