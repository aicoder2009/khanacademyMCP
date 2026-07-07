import test from "node:test";
import assert from "node:assert/strict";

import { KhanApiError } from "../src/khan-api/errors.js";
import { toolErrorResult } from "../src/tools/errors.js";

test("toolErrorResult describes transport failures as temporary service issues", () => {
  const result = toolErrorResult(new KhanApiError("connection refused", "network"), "searching Khan Academy");

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /could not be reached/);
  assert.match(result.content[0].text, /searching Khan Academy/);
  assert.match(result.content[0].text, /try again/);
});

test("toolErrorResult calls out rate limiting and timeouts specifically", () => {
  const rateLimited = toolErrorResult(
    new KhanApiError("still 429 after retries", "rate_limited", { status: 429 }),
    "fetching quizzes"
  );
  assert.match(rateLimited.content[0].text, /rate-limiting/);

  const timedOut = toolErrorResult(new KhanApiError("took too long", "timeout"), "fetching the article");
  assert.match(timedOut.content[0].text, /timed out/);
});

test("toolErrorResult reports non-transport errors as unexpected", () => {
  const result = toolErrorResult(new Error("boom"), "fetching the lesson");

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Unexpected error/);
  assert.match(result.content[0].text, /boom/);
});
