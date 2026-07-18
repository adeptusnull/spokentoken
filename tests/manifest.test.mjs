import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extension = path.join(root, "extension");
const manifest = JSON.parse(await readFile(path.join(extension, "manifest.json"), "utf8"));

test("manifest uses MV3 and a private least-privilege permission set", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Spoken Token");
  assert.deepEqual(
    [...manifest.permissions].sort(),
    ["activeTab", "offscreen", "scripting", "storage"].sort()
  );
  assert.deepEqual(
    [...manifest.host_permissions].sort(),
    ["http://127.0.0.1/*", "http://localhost/*"].sort()
  );
  assert.equal(manifest.content_scripts, undefined);
});

test("every manifest entry point exists", async () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    "offscreen.html",
    "offscreen.js",
    "content-script.js",
    "text-utils.js",
    "popup.css",
    "popup.js",
    "options.css",
    "options.js"
  ];

  await Promise.all(files.map((file) => access(path.join(extension, file))));
});

test("extension source contains no remote web endpoint", async () => {
  const files = [
    "service-worker.js",
    "offscreen.js",
    "popup.js",
    "options.js",
    "content-script.js"
  ];

  for (const file of files) {
    const source = await readFile(path.join(extension, file), "utf8");
    const urls = source.match(/https?:\/\/[^\s"'`)]+/g) || [];
    assert.deepEqual(
      urls.filter((url) => !/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)),
      [],
      `${file} contains a non-local endpoint`
    );
  }
});

test("the zero-dependency Mac voice server is included", async () => {
  await access(path.join(root, "local_server.py"));
  await access(path.join(root, "Start Spoken Token.command"));
});
