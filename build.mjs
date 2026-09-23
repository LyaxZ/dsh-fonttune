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
 * The render functions are exported so `test/run.mjs` can prove that the
 * committed `lib/` artifacts are exactly what the current `src/` produces —
 * without that check a source-only edit would ship (and be tested) as the old
 * bundle.
 *
 * @module dsh-fonttune/build
 */

import { existsSync, watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

/**
 * Builtins the host half may import.
 *
 * Node always provides these, so they need no entry in the package whitelist
 * above — the rule there is about PACKAGES, whose availability depends on the
 * installation. The host half uses them to resolve `@deepseek-ai/schemastery`
 * from the host rather than from this package's own `node_modules` (see
 * `loadSchemastery` in `src/index.mjs`).
 */
const HOST_BUILTINS = ["node:module", "node:path", "node:url"];

/** Local specifier rewritten to the inlined shared module. */
const SHARED_SPECIFIER = "./shared.cjs";

/** Source files, in the order the artifacts are generated. */
const SOURCES = ["src/shared.cjs", "src/client.js", "src/index.mjs"];

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
export function verifyClient(body) {
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
  if (!body.includes(`id: ${JSON.stringify(MODULE_ID)}`)) {
    throw new Error(`the loader registration does not use the id ${MODULE_ID}`);
  }
}

/**
 * Check the host half imports only packages the DSH installation provides.
 * @param {string} source - host source text.
 */
export function verifyHost(source) {
  const imports = [...source.matchAll(/^import[\s\S]*?from\s+["']([^"']+)["']/gm)].map(
    (match) => match[1]
  );
  for (const specifier of imports) {
    if (specifier.startsWith(".")) continue;
    if (HOST_BUILTINS.includes(specifier)) continue;
    if (!HOST_IMPORTS.includes(specifier)) {
      throw new Error(
        `the host half imports "${specifier}"; only these resolve from the DSH installation: ` +
          HOST_IMPORTS.join(", ") +
          ` (plus the builtins ${HOST_BUILTINS.join(", ")})`
      );
    }
  }
}

/**
 * Build the browser bundle text.
 *
 * The source is written as an ES module for readability, so the build strips
 * the single `export` keyword and attaches the CJS face the loader reads.
 * @param {string} sharedSource - `src/shared.cjs` text.
 * @param {string} clientSource - `src/client.js` text.
 * @returns {string} the bundle the loader evaluates.
 */
export function renderClient(sharedSource, clientSource) {
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
  verifyClient(body);
  return body;
}

/**
 * Render every artifact from the current sources, without touching the disk.
 * @param {{shared: string, client: string, host: string}} sources - source texts.
 * @returns {Record<string, string>} artifact path (relative to the root) to text.
 */
export function renderArtifacts(sources) {
  verifyHost(sources.host);
  return {
    "lib/client.js": renderClient(sources.shared, sources.client),
    "lib/shared.cjs": sources.shared,
    "lib/index.js": sources.host,
  };
}

/**
 * Read the three source files.
 * @returns {Promise<{shared: string, client: string, host: string}>} source texts.
 */
export async function readSources() {
  return {
    shared: await readFile(join(ROOT, "src", "shared.cjs"), "utf8"),
    client: await readFile(join(ROOT, "src", "client.js"), "utf8"),
    host: await readFile(join(ROOT, "src", "index.mjs"), "utf8"),
  };
}

/**
 * Write every artifact.
 * @returns {Promise<Record<string, number>>} artifact path to written bytes.
 */
export async function build() {
  const artifacts = renderArtifacts(await readSources());
  await mkdir(join(ROOT, "lib"), { recursive: true });
  const sizes = {};
  for (const [name, text] of Object.entries(artifacts)) {
    await writeFile(join(ROOT, name), text, "utf8");
    sizes[name] = Buffer.byteLength(text, "utf8");
  }
  return sizes;
}

/**
 * Whether this module was started as the program (rather than imported by a
 * test), so importing it never has side effects.
 * @returns {boolean} true when run as `node build.mjs`.
 */
function isMain() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return resolve(entry) === resolve(fileURLToPath(import.meta.url));
}

if (isMain()) {
  const stamp = () => new Date().toISOString().slice(11, 19);
  const sizes = await build();
  console.log(
    `[${stamp()}] built lib/index.js (${sizes["lib/index.js"]} B), lib/shared.cjs ` +
      `(${sizes["lib/shared.cjs"]} B), lib/client.js (${sizes["lib/client.js"]} B)`
  );

  if (process.argv.includes("--watch")) {
    // Watch the directory, not the files: a watcher bound to one inode keeps
    // waiting on a dead handle after an editor renames the file away.
    const srcDir = join(ROOT, "src");
    console.log(`watching ${relative(ROOT, srcDir)}; press Ctrl+C to stop`);
    let pending = null;
    watch(srcDir, (_event, name) => {
      if (name === null || name === undefined) return;
      if (!SOURCES.some((source) => source.endsWith(String(name)))) return;
      if (!existsSync(join(srcDir, String(name)))) return;
      if (pending !== null) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        build()
          .then(() => console.log(`[${stamp()}] rebuilt after ${name}`))
          .catch((error) => {
            console.error(error instanceof Error ? error.message : String(error));
          });
      }, 120);
    });
  }
}
