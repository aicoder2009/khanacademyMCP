import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKAUrl,
  decodeHtmlEntities,
  detectContentKind,
  extractYouTubeId,
  formatDuration,
  normalizeSlug,
} from "../src/khan-api/parser.js";

test("normalizeSlug strips full URLs and outer slashes", () => {
  assert.equal(
    normalizeSlug("https://www.khanacademy.org/math/algebra/v/intro-to-algebra/"),
    "math/algebra/v/intro-to-algebra"
  );
  assert.equal(normalizeSlug("/science/biology/a/cells/"), "science/biology/a/cells");
});

test("buildKAUrl normalizes the path before composing a URL", () => {
  assert.equal(
    buildKAUrl("/math/algebra/v/intro-to-algebra/"),
    "https://www.khanacademy.org/math/algebra/v/intro-to-algebra"
  );
});

test("detectContentKind recognizes core Khan Academy route types", () => {
  assert.equal(detectContentKind("math/algebra/v/intro-to-algebra"), "Video");
  assert.equal(detectContentKind("science/biology/a/cells"), "Article");
  assert.equal(detectContentKind("math/algebra/e/linear-equations"), "Exercise");
  assert.equal(detectContentKind("math/algebra/unit-1"), "Unknown");
});

test("extractYouTubeId supports direct IDs and URL forms", () => {
  assert.equal(extractYouTubeId("NybHckSEQBI"), "NybHckSEQBI");
  assert.equal(
    extractYouTubeId("https://www.youtube.com/watch?v=NybHckSEQBI"),
    "NybHckSEQBI"
  );
  assert.equal(extractYouTubeId("not-a-youtube-id"), null);
});

test("formatDuration handles minute and hour boundaries", () => {
  assert.equal(formatDuration(59), "0:59");
  assert.equal(formatDuration(3600), "1h 0m");
  assert.equal(formatDuration(3661), "1h 1m");
});

test("decodeHtmlEntities decodes named and numeric entities", () => {
  assert.equal(
    decodeHtmlEntities("Tom &amp; Jerry &#39;rocks&#39; &#x1F600;"),
    "Tom & Jerry 'rocks' 😀"
  );
});
