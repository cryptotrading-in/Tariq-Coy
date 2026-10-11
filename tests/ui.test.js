import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("inline application JavaScript in public/index.html is syntactically valid", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, "Expected an inline application script");
  for (const [, source] of scripts) {
    if (source.trim()) assert.doesNotThrow(() => new Function(source));
  }
});
