import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { createServer, registerAllTools, SERVER_INFO, SERVER_VERSION } from "../src/server.js";

const require = createRequire(import.meta.url);

function loadPackageJson(): { description: string; version: string } {
  for (const relativePath of ["../package.json", "../../package.json"]) {
    try {
      return require(relativePath) as { description: string; version: string };
    } catch {
      // Try the next level up
    }
  }
  throw new Error("package.json not found");
}

const packageJson = loadPackageJson();

test("server metadata stays aligned with package metadata", () => {
  assert.equal(SERVER_VERSION, packageJson.version);
  assert.equal(SERVER_INFO.version, packageJson.version);
  assert.equal(SERVER_INFO.description, packageJson.description);
});

test("createServer returns an MCP server instance", () => {
  const server = createServer();
  assert.ok(server);
  assert.equal(typeof server.connect, "function");
});

test("registerAllTools registers the expected public tool names", () => {
  const calls: Array<{ name: string; annotations?: Record<string, unknown> }> = [];
  const fakeServer = {
    tool: (...args: unknown[]) => {
      const annotations = args.length === 5 ? args[3] : args[2];
      calls.push({
        name: args[0] as string,
        annotations: annotations as Record<string, unknown> | undefined,
      });
      return {};
    },
  };

  registerAllTools(fakeServer as never, {} as never);

  assert.deepEqual(
    calls.map((call) => call.name),
    [
      "search",
      "list_subjects",
      "get_topic_tree",
      "get_content",
      "get_course",
      "get_transcript",
      "get_article",
      "get_lesson",
      "study_guide",
      "embed_video",
      "get_exercise",
      "get_quiz",
    ]
  );

  for (const call of calls) {
    assert.equal(call.annotations?.openWorldHint, true, `${call.name} should be open-world`);
  }
});
