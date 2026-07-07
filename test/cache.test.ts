import test from "node:test";
import assert from "node:assert/strict";

import { TTLCache } from "../src/utils/cache.js";

test("TTLCache returns stored values before expiry", () => {
  const cache = new TTLCache(100);
  cache.set("subject", ["math"]);

  assert.deepEqual(cache.get("subject"), ["math"]);
  assert.equal(cache.has("subject"), true);
});

test("TTLCache expires values after TTL", async () => {
  const cache = new TTLCache(5);
  cache.set("subject", ["math"]);

  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.equal(cache.get("subject"), undefined);
  assert.equal(cache.has("subject"), false);
});

test("TTLCache caps entries at maxEntries", () => {
  const cache = new TTLCache(60_000, 3);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  cache.set("d", 4);

  assert.equal(cache.size, 3);
  assert.equal(cache.get("a"), undefined); // oldest evicted
  assert.equal(cache.get("d"), 4);
});

test("TTLCache evicts the least recently used entry when full", () => {
  const cache = new TTLCache(60_000, 3);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  cache.get("a"); // refresh recency — "b" is now least recently used
  cache.set("d", 4);

  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("d"), 4);
});

test("TTLCache prefers evicting expired entries over live ones", async () => {
  const cache = new TTLCache(60_000, 3);
  cache.set("stale", 1, 5);
  cache.set("b", 2);
  cache.set("c", 3);

  await new Promise((resolve) => setTimeout(resolve, 15));
  cache.set("d", 4);

  assert.equal(cache.get("stale"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.get("d"), 4);
});

test("TTLCache overwrites an existing key without evicting others", () => {
  const cache = new TTLCache(60_000, 3);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  cache.set("b", 20);

  assert.equal(cache.size, 3);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("b"), 20);
  assert.equal(cache.get("c"), 3);
});
