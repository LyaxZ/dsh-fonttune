/**
 * dsh-fonttune offline checks.
 *
 * No browser, no network, no test framework: a minimal DOM, a minimal cordis
 * context and a minimal DSH settings surface stand in for the host, and the
 * built bundles are loaded exactly as the two real runtimes load them — the
 * host half through `import`, the browser half through a hand-made
 * `window.__ModuleLoader__`.
 *
 *   node test/run.mjs
 *
 * @module dsh-fonttune/test
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ENTRY = pathToFileURL(join(ROOT, "lib", "index.js")).href;

/**
 * No schemastery stand-in is needed: the host half imports the real
 * `@deepseek-ai/schemastery`, which resolves through this package's own
 * `node_modules` exactly as it does once installed into a DSH profile.
 */

let passed = 0;
let failed = 0;

/**
 * Run one named check.
 * @param {string} name - what is being checked.
 * @param {() => void | Promise<void>} body - the check.
 * @returns {Promise<void>} settlement.
 */
async function test(name, body) {
  try {
    await body();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}`);
    console.log(`       ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Group checks under a heading.
 * @param {string} title - the heading.
 */
function section(title) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ *
 * the stand-in DOM
 * ------------------------------------------------------------------ */

/**
 * A DOM element that records what the code under test does to it. Only the
 * surface the plugin touches is implemented, so an accidental dependency on
 * real DOM behavior surfaces as a failed check rather than a silent pass.
 */
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this._text = "";
    const own = this;
    this.style = {
      setProperty(name, value) {
        own[name] = value;
      },
      getPropertyValue(name) {
        return own[name] === undefined ? "" : own[name];
      },
    };
    this.classList = {
      _set: new Set(),
      add: (name) => own.classList._set.add(name),
      contains: (name) => own.classList._set.has(name),
    };
  }

  get textContent() {
    return this._text;
  }

  set textContent(value) {
    this._text = String(value);
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }

  remove() {
    if (this.parentNode === null) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  /**
   * Match the element against the selector forms the plugin uses.
   * @param {string} selector - a tag or `tag[attr="value"]`.
   * @returns {boolean} whether it matches.
   */
  matches(selector) {
    const attribute = /^([a-z]*)\[([a-z-]+)="([^"]*)"\]$/.exec(selector);
    if (attribute) {
      const tag = attribute[1];
      if (tag !== "" && this.tagName !== tag.toUpperCase()) return false;
      const key = attribute[2]
        .replace(/^data-/, "")
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] === attribute[3];
    }
    return this.tagName === selector.toUpperCase();
  }
}

/**
 * Build a document with just enough of the contract for the plugin.
 * @param {object} [options] - computed token values and inline body values.
 * @returns {object} the document.
 */
function createDocument(options = {}) {
  const head = new El("head");
  const body = new El("body");
  const declared = options.declared ?? {};
  for (const [name, value] of Object.entries(options.inline ?? {})) {
    body.style.setProperty(name, value);
  }
  const document = {
    head,
    body,
    createElement: (tag) => new El(tag),
    querySelector(selector) {
      const walk = (node) => {
        for (const child of node.children) {
          if (child.matches(selector)) return child;
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      return walk(head) ?? walk(body);
    },
    styleSheets: [],
  };
  const getComputedStyle = (element) => ({
    length: Object.keys(declared).length,
    ...Object.fromEntries(Object.keys(declared).map((name, index) => [index, name])),
    getPropertyValue(name) {
      const inline = element.style[name];
      if (inline !== undefined && inline !== "") return inline;
      return declared[name] ?? "";
    },
  });
  document.defaultView = { getComputedStyle };
  return { document, getComputedStyle };
}

/* ------------------------------------------------------------------ *
 * the stand-in cordis context and settings surface
 * ------------------------------------------------------------------ */

/**
 * A client-side context that records effects and serves the plugin's services.
 *
 * The effect stub mirrors cordis: an effect runs immediately and its returned
 * disposer is kept for fiber unload — it is NOT called on registration. That
 * distinction matters, because a disposer runs in a situation the effect body
 * does not, and the checks below exercise both.
 * @param {object} services - the service objects to expose.
 * @returns {object} the context.
 */
function createClientContext(services) {
  const effects = [];
  return {
    effects,
    effect(callback, label) {
      const disposer = callback();
      effects.push({ label, dispose: typeof disposer === "function" ? disposer : null });
      return () => {};
    },
    /** Unload the fiber: dispose every effect, as cordis does on collapse. */
    disposeAll() {
      for (const effect of [...effects].reverse()) {
        if (effect.dispose) effect.dispose();
      }
    },
    ...services,
  };
}

/**
 * A settings scope whose snapshot the test drives, mirroring the client
 * contract (`getSnapshot`, `subscribe`, `set`, `unset`).
 * @param {object} [initial] - the starting value and user layer.
 * @returns {object} the scope plus its test controls.
 */
function createScope(initial = {}) {
  const listeners = new Set();
  let snapshot = {
    status: "ready",
    value: initial.value ?? { sans: "", mono: "", sizeOffset: 0, weight: 0 },
    base: initial.value ?? {},
    user: initial.user ?? {},
    revision: 1,
    writable: true,
    mode: "host",
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async set(field, value) {
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value, [field]: value },
        user: { ...snapshot.user, [field]: value },
        revision: snapshot.revision + 1,
      };
      for (const listener of listeners) listener();
    },
    async unset(field) {
      const value = { ...snapshot.value };
      const user = { ...snapshot.user };
      delete value[field];
      delete user[field];
      snapshot = { ...snapshot, value, user, revision: snapshot.revision + 1 };
      for (const listener of listeners) listener();
    },
    /** Test-only: replace part of the snapshot, as a Host commit would. */
    publish(next) {
      snapshot = { ...snapshot, ...next, revision: snapshot.revision + 1 };
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

/* ------------------------------------------------------------------ *
 * loading the two halves
 * ------------------------------------------------------------------ */

const REACT_STUB = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children };
  },
  useState(initial) {
    return [typeof initial === "function" ? initial() : initial, () => {}];
  },
  useEffect() {},
  useMemo(factory) {
    return factory();
  },
  useRef(value) {
    return { current: value };
  },
  useCallback: (fn) => fn,
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};

const PRIMITIVES_STUB = {
  IconPlusOutline16: () => null,
  IconChevronDownOutline14: () => null,
  IconCheckOutline14: () => null,
  IconCloseFill14: () => null,
  IconSearchOutline16: () => null,
  Input: () => null,
};

const CLIENT_STUB = {
  react: REACT_STUB,
  "react/jsx-runtime": REACT_STUB,
  "react-dom": { createPortal: (node) => node },
  "@deepseek-ai/dsh-client-ui-primitives": PRIMITIVES_STUB,
};

/**
 * Load the built browser bundle through a stand-in module loader and apply it.
 * @param {object} ctx - the client context to hand to `apply`.
 * @returns {Promise<{registered: object[]}>} what the bundle registered.
 */
async function loadClientBundle(ctx) {
  const source = await readFile(join(ROOT, "lib", "client.js"), "utf8");
  const registered = [];
  // A browser's `window` IS the global object, and the bundle reads it that
  // way, so the loader facade is installed ON the ambient stub rather than
  // injected as a shadowing parameter.
  globalThis.window.__ModuleLoader__ = {
    load(entry) {
      registered.push(entry);
    },
  };
  const resolve = (specifier) => {
    if (!(specifier in CLIENT_STUB)) {
      throw new Error(`bundle required unknown module "${specifier}"`);
    }
    return CLIENT_STUB[specifier];
  };
  new Function("require", `${source}\nreturn 0;`)(resolve);
  assert.equal(registered.length, 1, "the bundle must register exactly one factory");
  const entry = registered[0];
  assert.equal(entry.id, "dsh-fonttune");
  const face = entry.factory(resolve);
  assert.equal(typeof face.apply, "function");
  assert.ok(Array.isArray(face.inject));
  face.apply(ctx);
  return { registered, face };
}

/**
 * A client context with a recording slot registry.
 * @param {object} scope - the settings scope to bind.
 * @param {string} [locale] - the active locale id.
 * @returns {{ctx: object, registered: object[]}} the context and its captures.
 */
function cardContext(scope, locale = "en") {
  const registered = [];
  const ctx = createClientContext({
    slots: {
      inject(name, callback) {
        assert.equal(name, "settings.plugin.item");
        callback();
      },
      register(options, component) {
        registered.push({ options, component });
        return () => {};
      },
    },
    locale: {
      bind: () => (key) => key,
      register: () => () => {},
      getLocale: () => ({ active: locale }),
    },
    settingsScope: { bind: () => scope },
  });
  return { ctx, registered };
}

/**
 * Apply the built host half against a stand-in host context.
 * @param {unknown} [config] - the composition config (base layer).
 * @returns {Promise<{table: Function[], section: object, module: object}>} the host state.
 */
async function loadHostHalf(config) {
  const module = await import(ENTRY);
  const table = [];
  let section = null;
  const ctx = {
    inject(names, callback) {
      if (!names.includes("settings")) return;
      callback({
        settings: {
          installSection(owner, namespace, schema, entry, hooks) {
            section = { owner, namespace, schema, entry, hooks };
            hooks.setSource(() => entry);
            hooks.onChange();
          },
        },
      });
    },
    on(event, listener) {
      if (event === "webserver/index-inject") table.push(listener);
    },
  };
  module.apply(ctx, config);
  return { table, section, module };
}

/* ------------------------------------------------------------------ *
 * checks
 * ------------------------------------------------------------------ */

const shared = require(join(ROOT, "lib", "shared.cjs"));

section("shared: sanitizing and family parsing");

await test("drops the characters that would break a declaration", () => {
  assert.equal(shared.sanitizeFamily('Arial"; color: red'), "Arial color red");
  assert.equal(shared.sanitizeFamily("Bad{}}"), "Bad");
  assert.equal(shared.sanitizeFamily("<script>"), "script");
  assert.equal(shared.sanitizeFamily("   "), "");
  assert.equal(shared.sanitizeFamily("a\\b"), "ab");
  assert.equal(shared.sanitizeFamily('"Inter"'), "Inter");
  assert.equal(shared.sanitizeFamily("url(evil)"), "urlevil");
  assert.equal(shared.sanitizeFamily("Noto Sans CJK SC / 思源黑体"), "Noto Sans CJK SC 思源黑体");
});

await test("keeps the names real families actually use", () => {
  for (const name of [
    "Inter",
    "Microsoft YaHei",
    "JetBrains Mono",
    "Sarasa Mono SC",
    "Source Han Sans SC",
    "Noto Sans CJK SC",
    "思源黑体",
    "微软雅黑",
    "HarmonyOS Sans SC",
    "Segoe UI Variable",
    "IBM Plex Mono",
    "Fira Code",
    "Cascadia Code",
    "SF Mono",
    "Alibaba PuHuiTi 3",
    "system-ui",
    "sans-serif",
    "-apple-system",
    "Material Icons Round",
    "Noto Color Emoji",
  ]) {
    assert.equal(shared.sanitizeFamily(name), name, `${name} must survive sanitizing`);
  }
});

await test("quotes anything that is not a generic keyword", () => {
  assert.equal(shared.quoteFamily("Microsoft YaHei"), '"Microsoft YaHei"');
  assert.equal(shared.quoteFamily("monospace"), "monospace");
  assert.equal(shared.quoteFamily("system-ui"), "system-ui");
  assert.equal(shared.quoteFamily('"Inter"'), '"Inter"', "a typed quote is normalized, not doubled");
});

await test("parses back every quoting style a user may have typed", () => {
  assert.deepEqual(shared.parseStack('"Inter", \'Microsoft YaHei\', monospace'), [
    "Inter",
    "Microsoft YaHei",
    "monospace",
  ]);
  assert.deepEqual(shared.parseStack("Inter,Microsoft YaHei , monospace"), [
    "Inter",
    "Microsoft YaHei",
    "monospace",
  ]);
  assert.deepEqual(shared.parseStack(""), []);
  assert.deepEqual(shared.parseStack(undefined), []);
  assert.deepEqual(shared.parseStack('"a,b",c'), ["a,b", "c"]);
});

await test("round-trips a stack through format and parse", () => {
  const families = ["JetBrains Mono", "Sarasa Mono SC", "monospace"];
  assert.equal(shared.formatStack(families), '"JetBrains Mono", "Sarasa Mono SC", monospace');
  assert.deepEqual(shared.parseStack(shared.formatStack(families)), families);
});

section("shared: configuration normalization");

await test("clamps the size offset and the weight", () => {
  assert.equal(shared.normalizeConfig({ sizeOffset: 99 }).sizeOffset, shared.SIZE_MAX);
  assert.equal(shared.normalizeConfig({ sizeOffset: -99 }).sizeOffset, shared.SIZE_MIN);
  assert.equal(shared.normalizeConfig({ weight: 100 }).weight, shared.WEIGHT_MIN);
  assert.equal(shared.normalizeConfig({ weight: 900 }).weight, shared.WEIGHT_MAX);
  assert.equal(shared.normalizeConfig({ weight: 0 }).weight, shared.WEIGHT_UNSET);
  assert.equal(shared.normalizeConfig("nonsense").sizeOffset, 0);
});

await test("an empty configuration is dormant", () => {
  assert.equal(shared.isDormant(shared.normalizeConfig({})), true);
  assert.equal(shared.isDormant(shared.normalizeConfig({ sizeOffset: 1 })), false);
});

await test("the scale is uniform and bounded", () => {
  assert.equal(shared.scaleFor(0), 1);
  assert.equal(shared.scaleFor(16), 2);
  assert.equal(shared.scaleFor(-8), 0.5);
  assert.equal(shared.scaleFor(-100), 0.5);
});

section("shared: the generated stylesheet");

await test("a dormant configuration injects nothing", () => {
  assert.equal(shared.buildFontCss({}), "");
  assert.equal(shared.buildFontCss({ sans: "  " }), "");
});

await test("families are declared at the source variables, code rule last", () => {
  const css = shared.buildFontCss({
    sans: '"Inter", "Microsoft YaHei"',
    mono: '"JetBrains Mono"',
  });
  // The design tokens chain to these variables, so overriding them is what
  // reaches the conversation markdown and the sidebar.
  assert.match(css, /^:root,body\{--dsw-font-family:"Inter", "Microsoft YaHei" !important\}/);
  assert.match(css, /body\{font-family:"Inter", "Microsoft YaHei" !important\}/);
  assert.match(
    css,
    /:root,body\{--dsw-font-mono:"JetBrains Mono" !important;--ds-font-family-code:"JetBrains Mono" !important\}/
  );
  assert.match(
    css,
    /pre,code,kbd,samp,var,tt,textarea,\.cm-editor \.cm-content\{font-family:"JetBrains Mono" !important\}/
  );
  assert.ok(
    css.indexOf("pre,code") > css.indexOf("body{font-family"),
    "the code rule must come after the body rule so it wins on equal specificity"
  );
});

await test("an unset family overrides none of its variables", () => {
  const monoOnly = shared.buildFontCss({ mono: '"JetBrains Mono"' });
  assert.equal(monoOnly.includes("--dsw-font-family:"), false);
  assert.equal(monoOnly.includes("--ds-font-family-code:"), true);
  const sansOnly = shared.buildFontCss({ sans: '"Inter"' });
  assert.equal(sansOnly.includes("--ds-font-family-code:"), false);
  assert.equal(sansOnly.includes("--dsw-font-family:"), true);
});

await test("the size offset scales tokens by one ratio", () => {
  const css = shared.buildFontCss(
    { sizeOffset: 2 },
    { "--dsw-font-s-14-font-size": "14px", "--dsw-font-s-14-line-height": "24px" }
  );
  assert.match(css, /--dsw-font-s-14-font-size:calc\(\(14px\) \* 1\.125\)/);
  assert.match(css, /--dsw-font-s-14-line-height:calc\(\(24px\) \* 1\.125\)/);
  assert.match(css, /^body,body \*\{/);
});

await test("the content size composes with DSH's own slider", () => {
  const css = shared.buildFontCss(
    { sizeOffset: 1 },
    { "--dsh-content-font-size": "17px", "--dsh-content-font-size-secondary": "16px" }
  );
  assert.match(css, /--dsh-content-font-size:calc\(\(17px\) \* 1\.0625\)/);
  assert.match(css, /--dsh-content-font-size-secondary:calc\(\(16px\) \* 1\.0625\)/);
});

await test("the embedded fallback map alone drives a real size rule", () => {
  const css = shared.buildFontCss({ sizeOffset: 2 }, shared.FALLBACK_TOKENS);
  assert.match(css, /--dsh-content-font-size:calc\(\(14px\) \* 1\.125\)/);
  assert.match(css, /--dsh-content-font-size-secondary:calc\(\(13px\) \* 1\.125\)/);
  assert.match(css, /--dsw-font-s-14-line-height:calc\(\(24px\) \* 1\.125\)/);
  assert.match(css, /--dsw-font-markdown-h1-font-size:calc\(\(21px\) \* 1\.125\)/);
});

await test("only typography tokens are scaled", () => {
  const css = shared.buildFontCss(
    { sizeOffset: 2 },
    {
      "--dsw-font-family": "Inter",
      "--dsw-font-s-14-font-family": "Inter",
      "--dsw-font-s-14-font-weight": "400",
      "--dsw-alias-bg-base": "#fff",
      "--dsh-content-font-delta": "0px",
    }
  );
  assert.equal(css.includes("--dsw-font-family:"), false);
  assert.equal(css.includes("--dsw-alias-bg-base"), false);
  assert.equal(css.includes("--dsh-content-font-delta"), false);
});

await test("a size offset without tokens injects no size rule", () => {
  assert.equal(shared.buildFontCss({ sizeOffset: 3 }, {}), "");
});

await test("tokens that derive from others via var() are skipped", () => {
  const css = shared.buildFontCss(
    { sizeOffset: 2 },
    {
      "--dsh-content-font-size": "14px",
      "--dsh-content-font-size-secondary": "min(calc(var(--dsh-content-font-size,14px) - 1px), 13px)",
      "--dsw-font-markdown-base-font-size": "var(--dsh-content-font-size,14px)",
      "--dsw-font-markdown-h1-font-size": "calc(21px + var(--dsh-content-font-delta))",
    }
  );
  assert.match(css, /--dsh-content-font-size:calc\(\(14px\) \* 1\.125\) !important/);
  assert.equal(css.includes("--dsh-content-font-size-secondary:"), false, "derived tokens inherit through the chain");
  assert.equal(css.includes("--dsw-font-markdown-base-font-size:"), false);
  assert.equal(css.includes("--dsw-font-markdown-h1-font-size:"), false);
});

await test("the weight rule writes the chosen integer verbatim", () => {
  assert.match(shared.buildFontCss({ weight: 300 }), /body,body \*\{font-weight:300 !important\}/);
  assert.match(shared.buildFontCss({ weight: 520 }), /font-weight:520 !important/);
  assert.match(shared.buildFontCss({ weight: 590 }), /font-weight:590 !important/);
  assert.equal(shared.buildFontCss({ weight: 0 }), "");
});

await test("generic keywords are neither western nor CJK", () => {
  assert.equal(shared.isGenericFamilyName("sans-serif"), true);
  assert.equal(shared.isGenericFamilyName("System-UI"), true);
  assert.equal(shared.isGenericFamilyName("Microsoft YaHei"), false);
});

await test("the CJK name heuristic recognizes the common faces", () => {
  assert.equal(shared.isCJKFamilyName("Microsoft YaHei"), true);
  assert.equal(shared.isCJKFamilyName("PingFang SC"), true);
  assert.equal(shared.isCJKFamilyName("Noto Sans SC"), true);
  assert.equal(shared.isCJKFamilyName("思源黑体"), true);
  assert.equal(shared.isCJKFamilyName("Inter"), false);
  assert.equal(shared.isCJKFamilyName("JetBrains Mono"), false);
});

await test("setting the western slot replaces the front entry and keeps the order", () => {
  const isEast = (name) => name === "宋体" || name === "PingFang SC";
  // replace the front western entry
  assert.deepEqual(shared.setWestEntry(["Inter", "宋体"], "HarmonyOS Sans", isEast), [
    "HarmonyOS Sans",
    "宋体",
  ]);
  // a stack with no western entry: insert at the front, keeping the tuned CJK
  assert.deepEqual(shared.setWestEntry(["宋体"], "Inter", isEast), ["Inter", "宋体"]);
  // no western slot at all (all CJK): the new west slot opens at the front
  assert.deepEqual(shared.setWestEntry(["宋体", "Inter", "PingFang SC"], "Inter", isEast), [
    "Inter",
    "宋体",
    "PingFang SC",
  ]);
});

await test("setting the CJK slot replaces in place or follows the western slot", () => {
  const isEast = (name) => name === "宋体" || name === "PingFang SC";
  // replace the first CJK entry, keep the rest of the tuned order
  assert.deepEqual(shared.setEastEntry(["Inter", "宋体", "PingFang SC"], "思源黑体", isEast), [
    "Inter",
    "思源黑体",
    "PingFang SC",
  ]);
  // no CJK entry yet: insert right after the western slot
  assert.deepEqual(shared.setEastEntry(["Inter", "system-ui"], "宋体", isEast), [
    "Inter",
    "宋体",
    "system-ui",
  ]);
  // empty stack
  assert.deepEqual(shared.setEastEntry([], "宋体", isEast), ["宋体"]);
  // dedupe across the stack
  assert.deepEqual(shared.setEastEntry(["Inter", "宋体"], "PingFang SC", isEast), [
    "Inter",
    "PingFang SC",
  ]);
});

await test("removing one entry leaves the other slots intact", () => {
  assert.deepEqual(
    shared.removeStackEntry(["Inter", "宋体", "PingFang SC"], "宋体"),
    ["Inter", "PingFang SC"]
  );
  assert.deepEqual(shared.removeStackEntry(["Inter"], "宋体"), ["Inter"]);
});

/**
 * The stand-in DOM the browser-half checks run against: DSH's own tokens are
 * present, and the content size is also on the body's inline style, which is
 * where the theme plugin keeps it.
 */
const dom = createDocument({
  declared: {
    "--dsh-content-font-size": "14px",
    "--dsh-content-font-size-secondary": "13px",
    "--dsw-font-s-14-font-size": "14px",
    "--dsw-font-s-14-line-height": "24px",
  },
  inline: { "--dsh-content-font-size": "14px" },
});
globalThis.document = dom.document;
globalThis.getComputedStyle = dom.getComputedStyle;
globalThis.window = {
  document: dom.document,
  getComputedStyle: dom.getComputedStyle,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  addEventListener() {},
  removeEventListener() {},
  innerWidth: 1200,
  innerHeight: 900,
};

/**
 * Give each browser-half check a pristine document. Without this, the styles
 * one check injects would be found by the next one's `querySelector`, and a
 * stale assertion could pass for the wrong reason.
 */
function resetDom() {
  globalThis.document.head.children.length = 0;
  globalThis.document.body.children.length = 0;
  delete globalThis.window.__ModuleLoader__;
}

await test("sanitizing never lets a name carry a rule or a declaration", () => {
  const hostile = shared.sanitizeFamily('Arial"; } body { background: url(evil) } /*');
  assert.equal(hostile.includes('"'), false);
  assert.equal(hostile.includes("{"), false);
  assert.equal(hostile.includes("}"), false);
  assert.equal(hostile.includes(";"), false);
  assert.equal(hostile.includes("<"), false);
  assert.equal(hostile.includes("\\"), false);
});

await test("a hostile family name cannot escape the declaration", () => {
  const css = shared.buildFontCss({ sans: 'Arial"; } body { background: url(evil) } /*' });
  // The exact output is the strongest statement available: two rules over one
  // declaration each, one quoted family, and every metacharacter gone. The
  // words that survive are inert text inside the quoted name.
  assert.equal(
    css,
    ':root,body{--dsw-font-family:"Arial body background urlevil" !important}\n' +
      'body{font-family:"Arial body background urlevil" !important}'
  );
  assert.equal(css.split("{").length - 1, 2, "exactly two rules may be produced");
  assert.equal(css.split("}").length - 1, 2);
  assert.equal(css.split('"').length - 1, 4, "the family must be quoted exactly once per rule");
  assert.equal(css.includes("background:"), false, "no injected declaration may survive");
  assert.equal(css.includes("url("), false, "no value may reach a url()");
  assert.equal(css.includes("/*"), false, "no comment may be opened");
});

await test("the fallback token map covers both families of token", () => {
  assert.ok(shared.FALLBACK_TOKENS["--dsh-content-font-size"]);
  assert.ok(shared.FALLBACK_TOKENS["--dsw-font-s-14-font-size"]);
  for (const name of Object.keys(shared.FALLBACK_TOKENS)) {
    assert.ok(shared.isFontToken(name), `${name} would never be scaled`);
  }
});

section("host half: settings section and index injection");

await test("registers the namespace and injects a style row", async () => {
  const host = await loadHostHalf(undefined);
  assert.equal(host.section.namespace, "dsh-fonttune");
  assert.equal(host.table.length, 1);
  const rows = [];
  host.table[0](rows);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "style");
  assert.equal(rows[0].text, "");
});

await test("a configured base layer is rendered into the row", async () => {
  const host = await loadHostHalf({ sans: '"Inter"', sizeOffset: 2, weight: 500 });
  const rows = [];
  host.table[0](rows);
  assert.match(rows[0].text, /body\{font-family:"Inter" !important\}/);
  assert.match(rows[0].text, /font-weight:500 !important/);
  assert.match(rows[0].text, /--dsh-content-font-size:calc\(\(14px\) \* 1\.125\)/);
});

await test("the host schema accepts real stacks and refuses bad ones", async () => {
  const { module } = await loadHostHalf(undefined);
  const schema = module.Config;
  const resolved = schema({ sans: '"Inter", "Microsoft YaHei"' });
  assert.equal(resolved.sans, '"Inter", "Microsoft YaHei"');
  // The schema enforces rather than clamps: a bad value must be refused, never
  // silently stored as a corrected one, or the card would show one thing and
  // the document another.
  assert.throws(() => schema({ sizeOffset: 99 }));
  assert.throws(() => schema({ sizeOffset: -99 }));
  assert.throws(() => schema({ weight: 900 }));
  assert.throws(() => schema({ sans: "a;b{}" }), "a declaration-breaking stack must be refused");
  const defaults = schema({});
  assert.equal(defaults.sans, "");
  assert.equal(defaults.sizeOffset, 0);
  assert.equal(defaults.weight, 0);
});

section("browser half: the card and the applied stylesheet");

await test("registers the card under the settings namespace key", async () => {
  const scope = createScope();
  resetDom();
  const { ctx, registered } = cardContext(scope);
  await loadClientBundle(ctx);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].options.name, "settings.plugin.item");
  assert.equal(registered[0].options.key, "dsh-fonttune");
  assert.equal(typeof registered[0].component, "function");
});

await test("applies the saved configuration to one style tag", async () => {
  const scope = createScope({
    value: { sans: '"Inter"', mono: "", sizeOffset: 2, weight: 500 },
    user: { sans: '"Inter"' },
  });
  resetDom();
  const { ctx } = cardContext(scope);
  await loadClientBundle(ctx);
  const tag = globalThis.document.querySelector('style[data-plugin-css="dsh-fonttune"]');
  assert.ok(tag, "the plugin must inject its stylesheet");
  assert.match(tag.textContent, /body\{font-family:"Inter" !important\}/);
  assert.match(tag.textContent, /font-weight:500 !important/);
  assert.match(tag.textContent, /--dsh-content-font-size:calc\(\(14px\) \* 1\.125\)/);
});

await test("the injected family rule survives the DSH token context", async () => {
  const scope = createScope({
    value: { sans: "", mono: '"Cascadia Code"', sizeOffset: 0, weight: 0 },
  });
  resetDom();
  const { ctx } = cardContext(scope);
  await loadClientBundle(ctx);
  const tag = globalThis.document.querySelector('style[data-plugin-css="dsh-fonttune"]');
  assert.equal(tag.textContent.includes("body{font-family"), false, "an empty stack injects no rule");
  assert.match(tag.textContent, /font-family:"Cascadia Code" !important/);
});

await test("a live Host change reaches the page", async () => {
  const scope = createScope();
  resetDom();
  const { ctx } = cardContext(scope);
  await loadClientBundle(ctx);
  const tag = () => globalThis.document.querySelector('style[data-plugin-css="dsh-fonttune"]');
  assert.equal(tag().textContent, "");
  scope.publish({ value: { sans: '"Inter"', mono: "", sizeOffset: 0, weight: 0 } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(tag().textContent, /font-family:"Inter"/);
});

await test("the card exposes its scope and a working translate seat", async () => {
  const scope = createScope();
  resetDom();
  const { ctx, registered } = cardContext(scope);
  await loadClientBundle(ctx);
  const face = registered[0].options.inject();
  assert.equal(face.scope, scope);
  assert.equal(face.t("card.title"), "Font tune");
});

await test("localized copy follows the active locale", async () => {
  const scope = createScope();
  resetDom();
  const { ctx, registered } = cardContext(scope, "zh");
  await loadClientBundle(ctx);
  const t = registered[0].options.inject().t;
  assert.equal(t("card.title"), "字体增强");
  assert.equal(t("sans.label"), "正文字体");
  assert.equal(t("size.unit"), "px");
});

await test("a composition without a working locale service still renders copy", async () => {
  const scope = createScope();
  resetDom();
  const registered = [];
  const ctx = createClientContext({
    slots: {
      inject: (name, callback) => callback(),
      register: (options, component) => {
        registered.push({ options, component });
        return () => {};
      },
    },
    locale: {
      bind: () => (key) => key,
      register: () => () => {},
      getLocale: () => {
        throw new Error("no locale service");
      },
    },
    settingsScope: { bind: () => scope },
  });
  await loadClientBundle(ctx);
  assert.equal(registered[0].options.inject().t("card.title"), "Font tune");
});

await test("resetting every axis leaves no user-layer entry", async () => {
  const scope = createScope({
    value: { sans: '"Inter"', mono: '"Mono"', sizeOffset: 3, weight: 300 },
    user: { sans: '"Inter"', mono: '"Mono"', sizeOffset: 3, weight: 300 },
  });
  resetDom();
  const { ctx } = cardContext(scope);
  await loadClientBundle(ctx);
  await scope.unset("sans");
  await scope.unset("mono");
  await scope.unset("sizeOffset");
  await scope.unset("weight");
  assert.deepEqual(scope.getSnapshot().user, {});
  const tag = globalThis.document.querySelector('style[data-plugin-css="dsh-fonttune"]');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tag.textContent, "", "the reset must empty the injected stylesheet");
});

section("integration: contracts that must not regress");

await test("the bundle requires only shell-held modules", async () => {
  const source = await readFile(join(ROOT, "lib", "client.js"), "utf8");
  const required = new Set(
    [...source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1])
  );
  for (const specifier of required) {
    assert.ok(
      [
        "react",
        "react/jsx-runtime",
        "react-dom",
        "@deepseek-ai/dsh-client-ui-primitives",
      ].includes(specifier),
      `${specifier} is not in the shell's module baseline`
    );
  }
});

await test("the bundle registers itself under the package name", async () => {
  const source = await readFile(join(ROOT, "lib", "client.js"), "utf8");
  const manifest = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  assert.ok(source.includes(`id: "${manifest.name}"`));
  assert.equal(manifest.exports["./client"], "./lib/client.js");
  assert.equal(manifest.dsh.client.platform, "web");
});

await test("the patch layer inserts exactly one row", async () => {
  const patch = await readFile(join(ROOT, "cordis.patch.yml"), "utf8");
  const inserts = patch.split("\n").filter((line) => line.trim() === "- insert:");
  const ids = patch.split("\n").filter((line) => /^\s{4}- id:/.test(line));
  assert.equal(inserts.length, 1);
  assert.equal(ids.length, 1, `expected one entry id, saw ${ids.length}`);
  assert.match(patch, /- id: fonttune/);
  assert.match(patch, /name: dsh-fonttune/);
});

await test("no JSON file carries a byte-order mark", async () => {
  for (const name of ["package.json"]) {
    const bytes = await readFile(join(ROOT, name));
    assert.notDeepEqual(
      [...bytes.subarray(0, 3)],
      [0xef, 0xbb, 0xbf],
      `${name} starts with a BOM, which breaks the DSH loader`
    );
  }
});

await test("both dictionaries carry the same keys, and every rendered key exists", async () => {
  const source = await readFile(join(ROOT, "src", "client.js"), "utf8");
  const keysOf = (locale) => {
    const start = source.indexOf(`\n  ${locale}: {`);
    const end = source.indexOf("\n  },", start);
    assert.ok(start > 0 && end > start, `could not slice the ${locale} dictionary`);
    return [...source.slice(start, end).matchAll(/"([a-zA-Z.]+)":/g)].map((match) => match[1]);
  };
  const en = keysOf("en");
  const zh = keysOf("zh");
  assert.ok(en.length > 30, `expected a full dictionary, saw ${en.length} keys`);
  assert.deepEqual([...en].sort(), [...zh].sort());
  const used = new Set([...source.matchAll(/\bt\(\s*"([a-zA-Z.]+)"/g)].map((m) => m[1]));
  for (const key of used) {
    assert.ok(en.includes(key), `en is missing "${key}"`);
    assert.ok(zh.includes(key), `zh is missing "${key}"`);
  }
});

/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
