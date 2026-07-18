import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "extension", "text-utils.js"), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context);

const { normalizeText, chunkText } = context.globalThis.SpokenTokenText;

test("normalizes webpage whitespace without joining words", () => {
  assert.equal(
    normalizeText("  One\u00a0 two \n\n three\u00ad  "),
    "One two three"
  );
});

test("splits long text into bounded speech requests", () => {
  const text = [
    "This is the first sentence. This is the second sentence. This is the third sentence.",
    "A separate paragraph should remain in order."
  ];
  const chunks = chunkText(text, 50);

  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 200));
  assert.match(chunks.join(" "), /first sentence/);
  assert.match(chunks.at(-1), /separate paragraph/);
});

test("caps the queue to protect the browser session", () => {
  const chunks = chunkText(Array.from({ length: 800 }, (_, index) => `Paragraph ${index}.`), 700);
  assert.equal(chunks.length, 500);
});
