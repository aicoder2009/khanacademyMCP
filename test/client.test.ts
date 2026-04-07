import test from "node:test";
import assert from "node:assert/strict";

import { KhanClient } from "../src/khan-api/client.js";

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

test("getExercise returns null when the underlying content lookup throws", async () => {
  const client = new KhanClient();

  (client as unknown as { contentForPath: () => Promise<never> }).contentForPath = async () => {
    throw new Error("network unavailable");
  };

  const exercise = await client.getExercise("math/algebra/e/linear-equations");
  assert.equal(exercise, null);
});

test("getQuizzes returns an empty list when the underlying content lookup throws", async () => {
  const client = new KhanClient();

  (client as unknown as { contentForPath: () => Promise<never> }).contentForPath = async () => {
    throw new Error("network unavailable");
  };

  const quizzes = await client.getQuizzes("math/algebra");
  assert.deepEqual(quizzes, []);
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
