/**
 * dsh-fonttune build — zero dependencies, no bundler.
 *
 * The browser half is not a normal ES module: the DSH client module system
 * serves it as a lazy-CJS bundle that registers itself with
 * `window.__ModuleLoader__.load({ id, factory })`, and the factory may only
 * `require` modules the shell already holds. So this script does what a
 * bundler would, by hand and deterministically:
 *
 *   src/shared.cjs  ->  inlined as a local CJS module inside the factory
 *   src/client.js   ->  wrapped in the factory, its `./shared.cjs` require
 *                       rewritten to that local module
 *   src/index.mjs   ->  copied to lib/index.js (plain ESM, run by Node)
 *
 * Usage:
 *   node build.mjs            build once and verify
 *   node build.mjs --watch    rebuild whenever a source file changes
 *
 * @module dsh-fonttune/build
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { watch } from "node:fs";

/** Package root, resolved from this file so the script runs from anywhere. */
const ROOT = dirname(fileURLToPath(import.meta.url));

/** Browser bundle id: the loader keys bundles by the package name. */
const MODULE_ID = "dsh-fonttune";

/** Modules the bundle is allowed to require at materialization time. */
const ALLOWED_REQUIRES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "@deepseek-ai/dsh-client-ui-primitives",
];

/** Packages that must resolve from the DSH installation at run time. */
const HOST_IMPORTS = ["@deepseek-ai/schemastery"];

/** Local specifier rewritten to the inlined shared module. */
const SHARED_SPECIFIER = "./shared.cjs";

/** Prefix and suffix of the loader registration. */
const HEAD = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(MODULE_ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
`;

const TAIL = `
\t\treturn module.exports;
\t}
});
`;

/**
 * Replace every module-scope `require("./shared.cjs")` with the inlined
 * binding. The specifier only ever appears in that one form, and the check
 * below fails the build if a different one shows up.
 * @param {string} source - client source text.
 * @param {string} binding - the local variable name holding shared.
 * @returns {string} the rewritten source.
 */
function rewriteSharedRequire(source, binding) {
  const pattern = /require\(\s*["']\.\/shared\.cjs["']\s*\)/g;
  const rewritten = source.replace(pattern, binding);
  if (rewritten.includes(SHARED_SPECIFIER)) {
    throw new Error(
      `client source mentions ${SHARED_SPECIFIER} outside a require() call; inline it by hand`
    );
  }
  return rewritten;
}

/**
 * Fail the build when the bundle could not load in the browser.
 *
 * The checks mirror what the module system enforces: every require must name a
 * shell-held module, the factory must publish the plugin face, and an ESM
 * `export` left in the body would be a syntax error inside a CJS factory.
 * @param {string} body - the wrapped factory body.
 */
function verify(body) {
  const required = new Set(
    [...body.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1])
  );
  for (const specifier of required) {
    if (!ALLOWED_REQUIRES.includes(specifier)) {
      throw new Error(
        `the browser bundle requires "${specifier}", which the shell does not provide; ` +
          `allowed: ${ALLOWED_REQUIRES.join(", ")}`
      );
    }
  }
  if (!/\bexports\.apply\s*=/.test(body)) {
    throw new Error("the browser bundle does not export apply");
  }
  if (!/\bexports\.inject\s*=/.test(body)) {
    throw new Error("the browser bundle does not export inject");
  }
  if (/^\s*export\s/m.test(body)) {
    throw new Error("the browser bundle still contains an ESM export inside a CJS factory");
  }
  const idMatches = body.includes(`id: ${JSON.stringify(MODULE_ID)}`);
  if (!idMatches) {
    throw new Error(`the loader registration does not use the id ${MODULE_ID}`);
  }
}

/**
 * Build the browser bundle.
 *
 * The source is written as an ES module for readability, so the build strips
 * the single `export` keyword and attaches the CJS face the loader reads.
 * @returns {Promise<number>} the written size in bytes.
 */
async function buildClient() {
  const sharedSource = await readFile(join(ROOT, "src", "shared.cjs"), "utf8");
  const clientSource = await readFile(join(ROOT, "src", "client.js"), "utf8");
  const stripped = clientSource.replace(/\bexport function apply\(/, "function apply(");
  if (stripped === clientSource) {
    throw new Error("client source must declare `export function apply(`");
  }
  const rewritten = rewriteSharedRequire(stripped, "__dfpShared");

  const body = [
    HEAD,
    "\t\t// ---- inlined from src/shared.cjs ----\n",
    "var __dfpShared = (function () {\n",
    "\tvar module = { exports: {} };\n",
    "\tvar exports = module.exports;\n",
    sharedSource,
    "\n\treturn module.exports;\n",
    "})();\n",
    "\t\t// ---- src/client.js ----\n",
    rewritten,
    "\nexports.apply = apply;\nexports.inject = inject;\n",
    TAIL,
  ].join("");

  verify(body);
  await mkdir(join(ROOT, "lib"), { recursive: true });
  await writeFile(join(ROOT, "lib", "client.js"), body, "utf8");
  return Buffer.byteLength(body, "utf8");
}

/**
 * Copy the host half and its shared module into `lib`, then check that the
 * only bare imports left are packages the DSH installation provides.
 * @returns {Promise<number>} the host entry size in bytes.
 */
async function buildHost() {
  const source = await readFile(join(ROOT, "src", "index.mjs"), "utf8");
  const imports = [...source.matchAll(/^import[\s\S]*?from\s+["']([^"']+)["']/gm)].map(
    (match) => match[1]
  );
  for (const specifier of imports) {
    if (specifier.startsWith(".")) continue;
    if (!HOST_IMPORTS.includes(specifier)) {
      throw new Error(
        `the host half imports "${specifier}"; only these resolve from the DSH installation: ` +
          HOST_IMPORTS.join(", ")
      );
    }
  }
  await mkdir(join(ROOT, "lib"), { recursive: true });
  await copyFile(join(ROOT, "src", "index.mjs"), join(ROOT, "lib", "index.js"));
  await copyFile(join(ROOT, "src", "shared.cjs"), join(ROOT, "lib", "shared.cjs"));
  return Buffer.byteLength(source, "utf8");
}

/**
 * Run both halves once.
 * @returns {Promise<void>} settlement after both are written and verified.
 */
async function build() {
  const clientSize = await buildClient();
  const hostSize = await buildHost();
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(
    `[${stamp}] built lib/index.js (${hostSize} B), lib/shared.cjs, lib/client.js (${clientSize} B)`
  );
}

await build();

if (process.argv.includes("--watch")) {
  const targets = ["src/shared.cjs", "src/client.js", "src/index.mjs"].map((name) =>
    resolve(ROOT, name)
  );
  console.log(`watching ${targets.length} sources; press Ctrl+C to stop`);
  let pending = null;
  for (const target of targets) {
    watch(target, () => {
      if (pending !== null) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        build().catch((error) => {
          console.error(error instanceof Error ? error.message : String(error));
        });
      }, 120);
    });
  }
}
