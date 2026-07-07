import test from "node:test";
import assert from "node:assert/strict";

import { KhanClient } from "../src/khan-api/client.js";
import { KhanApiError } from "../src/khan-api/errors.js";

test("search short-circuits empty queries without network access", async () => {
  const client = new KhanClient();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  try {
    const results = await client.search("   ");
    assert.deepEqual(results, []);
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getTranscript accepts a direct YouTube video ID", async () => {
  const client = new KhanClient();
  let capturedArgs: [string, string, string] | null = null;

  (client as unknown as {
    fetchYouTubeTranscript: (youtubeId: string, lang: string, title: string) => Promise<unknown>;
  }).fetchYouTubeTranscript = async (youtubeId: string, lang: string, title: string) => {
    capturedArgs = [youtubeId, lang, title];
    return {
      videoTitle: title,
      youtubeId,
      language: lang,
      entries: [],
      fullText: "",
    };
  };

  await client.getTranscript("NybHckSEQBI", "es");

  assert.deepEqual(capturedArgs, ["NybHckSEQBI", "es", "NybHckSEQBI"]);
});

test("getExercise returns null when the underlying content lookup throws an internal error", async () => {
  const client = new KhanClient();

  (client as unknown as { contentForPath: () => Promise<never> }).contentForPath = async () => {
    throw new Error("unexpected parse failure");
  };

  const exercise = await client.getExercise("math/algebra/e/linear-equations");
  assert.equal(exercise, null);
});

test("getExercise propagates transport failures as KhanApiError", async () => {
  const client = new KhanClient();

  (client as unknown as { contentForPath: () => Promise<never> }).contentForPath = async () => {
    throw new KhanApiError("connection refused", "network");
  };

  await assert.rejects(
    client.getExercise("math/algebra/e/linear-equations"),
    (error: unknown) => error instanceof KhanApiError && error.reason === "network"
  );
});

test("getQuizzes returns an empty list when the underlying content lookup throws an internal error", async () => {
  const client = new KhanClient();

  (client as unknown as { contentForPath: () => Promise<never> }).contentForPath = async () => {
    throw new Error("unexpected parse failure");
  };

  const quizzes = await client.getQuizzes("math/algebra");
  assert.deepEqual(quizzes, []);
});

test("getQuizzes propagates transport failures as KhanApiError", async () => {
  const client = new KhanClient();

  (client as unknown as { contentForPath: () => Promise<never> }).contentForPath = async () => {
    throw new KhanApiError("HTTP 502", "http", { status: 502 });
  };

  await assert.rejects(
    client.getQuizzes("math/algebra"),
    (error: unknown) => error instanceof KhanApiError && error.status === 502
  );
});

test("getContent throws KhanApiError when both the API and the scrape fallback are unreachable", async () => {
  const client = new KhanClient();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new Error("getaddrinfo ENOTFOUND www.khanacademy.org");
  }) as typeof fetch;

  try {
    await assert.rejects(
      client.getContent("math/algebra/v/intro-to-algebra"),
      (error: unknown) => error instanceof KhanApiError && error.reason === "network"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getContent returns null when Khan Academy responds but the content does not exist", async () => {
  const client = new KhanClient();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/internal/graphql")) {
      return new Response(JSON.stringify({ data: { contentRoute: { listedPathData: null } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;

  try {
    const content = await client.getContent("math/no-such-thing/v/nope");
    assert.equal(content, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listSubjects caches static fallback results after a failed API lookup", async () => {
  const client = new KhanClient();
  let graphqlCalls = 0;

  (client as unknown as {
    graphql: () => Promise<null>;
  }).graphql = async () => {
    graphqlCalls += 1;
    return null;
  };

  const first = await client.listSubjects();
  const second = await client.listSubjects();

  assert.ok(first.length > 0);
  assert.deepEqual(second, first);
  assert.equal(graphqlCalls, 1);
});
