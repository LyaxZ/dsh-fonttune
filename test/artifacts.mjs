/**
 * Prove the committed `lib/` artifacts are exactly what the current `src/`
 * produces.
 *
 * Every other suite loads `lib/`, so a source-only edit would otherwise be
 * tested (and shipped) as the previous build. This one renders the artifacts
 * in memory and compares them byte for byte with the files on disk.
 *
 *   node test/artifacts.mjs
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderArtifacts, readSources } from "../build.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : " — " + detail}`);
  }
}

console.log("\nbuilt artifacts match src/");

const expected = renderArtifacts(await readSources());
for (const [name, text] of Object.entries(expected)) {
  const path = join(ROOT, name);
  if (!existsSync(path)) {
    check(`${name} exists`, false, "run `node build.mjs`");
    continue;
  }
  const actual = await readFile(path, "utf8");
  check(
    `${name} is the current build`,
    actual === text,
    actual === text
      ? ""
      : `stale by ${Math.abs(actual.length - text.length)} bytes — run \`node build.mjs\``
  );
}

// The bundle must stay importable by the host half's runtime, and the host half
// must not gain a bare import the DSH installation does not provide.
check(
  "lib/index.js imports lib/shared.cjs relatively",
  expected["lib/index.js"].includes('from "./shared.cjs"')
);
check(
  "the client bundle registers exactly one factory",
  [...expected["lib/client.js"].matchAll(/__ModuleLoader__\.load\(/g)].length === 1
);
check(
  "no artifact carries a byte-order mark",
  Object.values(expected).every((text) => text.charCodeAt(0) !== 0xfeff)
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
