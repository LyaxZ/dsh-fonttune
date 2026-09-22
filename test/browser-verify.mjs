/**
 * Run the browser checks that need a LIVE DSH instance, in one command.
 *
 *   node test/browser-verify.mjs <url-with-token> [--writers] [--only name,name]
 *
 * Every script behind this runner drives a real headless Edge against a
 * running DSH Web UI over CDP. They are the half of the suite that cannot run
 * offline, because they measure what the shipped stylesheets actually compute
 * in a real page.
 *
 * The default group is read-only: it opens the settings sheet, walks the card
 * and reads computed styles, and never writes the plugin's namespace.
 *
 * `--writers` adds the scripts that DO write the namespace (`slider-walk`,
 * `split-walk`, `split-verify`, `weight-verify`). Each of them snapshots the
 * user layer first and restores it before exiting — but a run killed midway
 * can leave its values behind, and the way back is
 * `node test/set-user-layer.mjs <url> '<json of the original layer>'`.
 *
 * `--only` runs a comma-separated subset by name (see the list it prints).
 *
 * Start the instance the scripts measure against as a managed background job:
 *
 *   dsh web --port 0 --no-open        # prints the URL with its token
 *
 * @module dsh-fonttune/test/browser-verify
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The scripts this runner knows, with the group each belongs to.
 *
 * `writers` marks the ones that write the plugin's namespace through the live
 * settings RPC. `report` marks a diagnostic dump whose exit code is not a
 * verdict (it still fails the run when it crashes).
 */
const CHECKS = [
  { name: "browser-probe", script: "browser-probe.mjs", args: ["--open-settings"] },
  { name: "ui-walk", script: "ui-walk.mjs", args: [] },
  { name: "style-verify", script: "style-verify.mjs", args: [], report: true },
  { name: "slider-walk", script: "slider-walk.mjs", args: [], writers: true },
  { name: "split-walk", script: "split-walk.mjs", args: [], writers: true },
  { name: "split-verify", script: "split-verify.mjs", args: [], writers: true },
  { name: "weight-verify", script: "weight-verify.mjs", args: [], writers: true },
];

const argv = process.argv.slice(2);
const url = argv.find((argument) => !argument.startsWith("--"));
const writers = argv.includes("--writers");
const onlyArg = argv.find((argument) => argument.startsWith("--only"));
const only = onlyArg
  ? (onlyArg.includes("=") ? onlyArg.split("=")[1] : argv[argv.indexOf(onlyArg) + 1] ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
  : null;

if (!url) {
  console.error("usage: node test/browser-verify.mjs <url-with-token> [--writers] [--only name,name]");
  console.error("known checks: " + CHECKS.map((check) => check.name).join(", "));
  process.exit(2);
}

const selected = CHECKS.filter((check) => {
  if (only !== null && !only.includes(check.name)) return false;
  return writers || !check.writers;
});

if (selected.length === 0) {
  console.error("no check matched --only " + String(only));
  process.exit(2);
}

/**
 * Run one script and resolve with how it ended.
 * @param {object} check - the entry from CHECKS.
 * @returns {Promise<{name: string, code: number|null, ms: number, report: boolean}>}
 */
function run(check) {
  return new Promise((resolve) => {
    const started = Date.now();
    console.log(`\n=== ${check.name} (${check.script}) ===`);
    // `inherit` keeps each script's own report in the terminal as it happens,
    // and avoids capturing another program's output through a pipe.
    const child = spawn(
      process.execPath,
      [join(HERE, check.script), url, ...check.args],
      { stdio: "inherit" }
    );
    child.on("error", (error) => {
      console.error(`${check.name}: could not start: ${error.message}`);
      resolve({ name: check.name, code: 1, ms: Date.now() - started, report: check.report === true });
    });
    child.on("exit", (code, signal) => {
      const result = signal === null ? code : 1;
      resolve({ name: check.name, code: result, ms: Date.now() - started, report: check.report === true });
    });
  });
}

const results = [];
for (const check of selected) {
  results.push(await run(check));
}

console.log("\n=== summary ===");
let failed = 0;
for (const result of results) {
  const seconds = (result.ms / 1000).toFixed(1) + "s";
  const ok = result.code === 0;
  if (!ok) failed += 1;
  const label = result.report && ok ? "report" : ok ? "ok" : "FAILED";
  console.log(`  ${label.padEnd(7)} ${result.name.padEnd(15)} ${seconds.padStart(7)}  (exit ${String(result.code)})`);
}
if (failed > 0) {
  console.log(`\n${failed} of ${results.length} checks failed`);
  process.exit(1);
}
console.log(`\nall ${results.length} checks passed`);
