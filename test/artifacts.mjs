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

// The fallback notice (the write the document never took) only renders when the
// slider that raised it was handed its text, so the two counts must agree.
const sliders = [...expected["lib/client.js"].matchAll(/h\(NumberSlider, \{/g)].length;
const noticeTexts = [...expected["lib/client.js"].matchAll(/revertedText: t\(/g)].length;
check(
  "every slider carries the fallback notice text",
  sliders > 0 && sliders === noticeTexts,
  `${sliders} slider(s), ${noticeTexts} notice text(s)`
);
check(
  "the fallback notice has a style rule",
  expected["lib/client.js"].includes(".dfp-sliderNotice{")
);

// Everything the card queues (`flushTimer`, `pendingOps`, `pendingOrder`) is a
// binding of ONE render, and a function component gets fresh ones on every render.
// The early-close listeners are registered once, by the render that mounted the
// card, so a listener calling the render's own `flushPendingWrites` closes the
// window that the MOUNT render had — the empty one it started with. Measured live
// before this was fixed: a move queued in render 2, `pagehide` arriving at +91 ms
// flushed render 1's empty queue (ops `[]`), and the write only left at +306 ms
// when the window expired anyway. Hence the flush goes through a ref that every
// render refreshes.
const closeWindow = expected["lib/client.js"].match(/var closeWindow = function \(\) \{[\s\S]{0,400}?\};/);
check(
  "the early-close listeners flush the live queue, not the mount render's",
  closeWindow !== null &&
    closeWindow[0].includes("flushRef.current()") &&
    !closeWindow[0].includes("flushPendingWrites()"),
  closeWindow === null ? "no closeWindow in the bundle" : closeWindow[0].replace(/\s+/g, " ")
);
check(
  "that ref is refreshed on every render",
  expected["lib/client.js"].includes("flushRef.current = flushPendingWrites;")
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
