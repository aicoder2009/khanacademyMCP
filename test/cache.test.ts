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
