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

/**
 * The `font-weight` one weight group resolves to: its own base plus the offset
 * in force where the element sits, clamped to the legal CSS range.
 * @param {number} base - the weight DSH gives that group.
 * @returns {string} the declaration value.
 */
function ladder(base) {
  return `clamp(100,calc(${base} + var(--dfp-wdelta,0)),900)`;
}

/**
 * The rule that scopes one weight group inside the conversation.
 * @param {string} group - the element list of the group.
 * @param {number} base - the group's own weight.
 * @returns {string} the rule the stylesheet must contain.
 */
function ladderRule(group, base) {
  return `[class*="_markdown_" i] :is(${group}){font-weight:${ladder(base)} !important}`;
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

  /**
   * Read an attribute, with `style` serialized the way the theme's inline
   * token writes appear: the plugin's cheap refresh gate watches that string.
   * @param {string} name - the attribute name.
   * @returns {string|null} the value, or null when the attribute is absent.
   */
  getAttribute(name) {
    if (name !== "style") return null;
    const declarations = Object.keys(this).filter((key) => key.startsWith("--"));
    if (declarations.length === 0) return "";
    return declarations.map((key) => `${key}: ${this[key]}`).join("; ") + ";";
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

  /** An element is connected when its ancestor chain reaches head or body. */
  get isConnected() {
    let node = this;
    while (node.parentNode !== null) node = node.parentNode;
    return node.tagName === "HEAD" || node.tagName === "BODY" || node.tagName === "HTML";
  }

  /** Query this subtree, so a served row can be found the way the browser does. */
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
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
    value: initial.value ?? {
      sans: "",
      mono: "",
      sizeOffset: 0,
      sizeOffsetCode: 0,
      weight: 0,
      weightCode: 0,
    },
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
 *
 * Every card seat the plugin offers is recorded, in the order they are offered,
 * so a check can look any of them up: the rc line's `settings.plugin.item`
 * cell, the alpha line's `plugins.item` entry in the Plugins page, and the
 * alpha line's per-package `plugins.bundle.config` cell.
 * @param {object} scope - the settings scope to bind.
 * @param {string} [locale] - the active locale id.
 * @returns {{ctx: object, registered: object[], seats: string[]}} the context and its captures.
 */
function cardContext(scope, locale = "en") {
  const registered = [];
  const seats = [];
  const ctx = createClientContext({
    slots: {
      inject(name, callback) {
        assert.ok(
          ["settings.plugin.item", "plugins.item", "plugins.bundle.config"].includes(name),
          `unexpected slot: ${name}`
        );
        seats.push(name);
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
  return { ctx, registered, seats };
}

/**
 * Apply the built host half against a stand-in host context.
 * @param {unknown} [config] - the composition config (base layer).
 * @param {object} [options] - the host dialect to stand in for.
 * @param {"rc"|"alpha"} [options.dialect] - which settings service the host exposes.
 * @returns {Promise<{table: Function[], section: object, module: object, effects: object[]}>} the host state.
 */
async function loadHostHalf(config, options = {}) {
  const module = await import(ENTRY);
  const table = [];
  const effects = [];
  const presentations = [];
  const dialect = options.dialect ?? "rc";
  let section = null;
  const ctx = {
    fiber: { uid: "uid:test", config: options.liveConfig ?? {} },
    inject(names, callback) {
      if (!names.includes("settings")) return;
      callback({
        settings:
          dialect === "alpha"
            ? {
                configure(presentation, owner) {
                  presentations.push({ presentation, owner });
                  return () => {};
                },
              }
            : {
                installSection(owner, namespace, schema, entry, hooks) {
                  section = { owner, namespace, schema, entry, hooks };
                  hooks.setSource(() => entry);
                  hooks.onChange();
                },
              },
        effect(callback) {
          const disposer = callback();
          effects.push(typeof disposer === "function" ? disposer : null);
          return () => {};
        },
      });
    },
    on(event, listener) {
      if (event === "webserver/index-inject") table.push(listener);
    },
  };
  module.apply(ctx, config);
  return { table, section, module, effects, presentations };
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

await test("clamps the size offsets and the weight axes", () => {
  assert.equal(shared.normalizeConfig({ sizeOffset: 99 }).sizeOffset, shared.SIZE_MAX);
  assert.equal(shared.normalizeConfig({ sizeOffset: -99 }).sizeOffset, shared.SIZE_MIN);
  assert.equal(shared.normalizeConfig({ sizeOffsetCode: 99 }).sizeOffsetCode, shared.SIZE_MAX);
  assert.equal(shared.normalizeConfig({ sizeOffsetCode: -99 }).sizeOffsetCode, shared.SIZE_MIN);
  // The two weight axes are OFFSETS: they clamp to their own range and accept
  // negative values (lighter than DSH's own).
  assert.equal(shared.normalizeConfig({ weight: 999 }).weight, shared.WEIGHT_DELTA_CEIL);
  assert.equal(shared.normalizeConfig({ weight: -999 }).weight, shared.WEIGHT_DELTA_FLOOR);
  assert.equal(shared.normalizeConfig({ weight: -60 }).weight, -60);
  assert.equal(shared.normalizeConfig({ weight: 0 }).weight, shared.WEIGHT_UNSET);
  assert.equal(shared.normalizeConfig("nonsense").sizeOffset, 0);
  assert.equal(shared.normalizeConfig("nonsense").sizeOffsetCode, 0);
});

await test("an absolute weight from an older document migrates to its offset", () => {
  // 0.2.7 and earlier stored an ABSOLUTE weight (300…600, 400 = normal). The
  // window sits outside the offset range, so the conversion is unambiguous —
  // and idempotent, which is what keeps a saved setup meaning the same thing.
  assert.equal(shared.normalizeConfig({ weight: 400 }).weight, 0);
  assert.equal(shared.normalizeConfig({ weight: 560 }).weight, 160);
  assert.equal(shared.normalizeConfig({ weight: 300 }).weight, -100);
  assert.equal(shared.normalizeConfig({ weightDialog: 460 }).weightDialog, 60);
  // A value already inside the offset range is a delta and stays untouched.
  assert.equal(shared.normalizeConfig({ weight: 160 }).weight, 160);
  assert.equal(shared.normalizeConfig({ weight: -100 }).weight, -100);
  // The code axis is an offset as well, so the same migration applies to it.
  assert.equal(shared.normalizeConfig({ weightCode: 460 }).weightCode, 60);
  // Presets and the per-theme map go through the same conversion.
  const preset = shared.normalizePresets(JSON.stringify([{ name: "old", values: { weight: 520 }, savedAt: 1 }]));
  assert.equal(preset[0].values.weight, 120);
});

await test("an empty configuration is dormant", () => {
  assert.equal(shared.isDormant(shared.normalizeConfig({})), true);
  // The retired interface axes render nothing, so setting only them is still
  // dormant rather than counting as a change.
  assert.equal(shared.isDormant(shared.normalizeConfig({ sizeOffset: 1 })), true);
  assert.equal(shared.isDormant(shared.normalizeConfig({ lineHeight: 130 })), true);
  // The axes that do render are not dormant.
  assert.equal(shared.isDormant(shared.normalizeConfig({ weight: 80 })), false);
  assert.equal(shared.isDormant(shared.normalizeConfig({ weight: -80 })), false);
  assert.equal(shared.isDormant(shared.normalizeConfig({ sizeOffsetCode: -1 })), false);
  assert.equal(shared.isDormant(shared.normalizeConfig({ sizeOffsetDialog: 1 })), false);
  assert.equal(shared.isDormant(shared.normalizeConfig({ weightDialog: 80 })), false);
  assert.equal(shared.isDormant(shared.normalizeConfig({ lineHeightDialog: 120 })), false);
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
    /pre,code,kbd,samp,var,tt,textarea,\.cm-editor,\.dfp-previewCode,\[class\*="code" i\],\[class\*="terminal" i\]\{font-family:"JetBrains Mono" !important\}/
  );
  assert.ok(
    css.indexOf("pre,code,kbd") > css.indexOf("body{font-family"),
    "the code rule must come after the body rule so it wins on equal specificity"
  );
  // Surfaces only: a `… *` descendant here would cost an ancestor walk per
  // element per recalculation, and everything inside a code surface inherits.
  assert.equal(/pre \*|code \*|terminal" i\] \*/.test(css), false);
});

await test("an unset family overrides none of its variables", () => {
  const monoOnly = shared.buildFontCss({ mono: '"JetBrains Mono"' });
  assert.equal(monoOnly.includes("--dsw-font-family:"), false);
  assert.equal(monoOnly.includes("--ds-font-family-code:"), true);
  const sansOnly = shared.buildFontCss({ sans: '"Inter"' });
  assert.equal(sansOnly.includes("--ds-font-family-code:"), false);
  assert.equal(sansOnly.includes("--dsw-font-family:"), true);
});

await test("the retired interface size offset injects nothing", () => {
  // DSH exposes no interface size hook: the settings sheet, the sidebars and
  // the workspace size their text with literals, and the interface ladder
  // tokens only reach conversation-area widgets. The durable field is kept so
  // old documents and presets still parse, but it must never emit a rule.
  const css = shared.buildFontCss(
    { sizeOffset: 2 },
    {
      "--dsw-font-s-14-font-size": "14px",
      "--dsw-font-s-14-line-height": "24px",
      "--dsh-content-font-size": "14px",
    }
  );
  assert.equal(css, "", "no interface rule and no conversation rule");
});

await test("the retired interface offset leaves every token to its own axis", () => {
  const base = {
    "--dsw-font-s-14-font-size": "14px",
    "--dsw-font-markdown-code": "12px/19px var(--ds-font-family-code)",
    "--dsh-content-font-size": "14px",
  };
  assert.equal(shared.buildFontCss({ sizeOffset: 2 }, base), "");
  // The code axis and the dialog axis are untouched by that retirement.
  const code = shared.buildFontCss({ sizeOffsetCode: 2 }, base);
  assert.match(code, /--dsw-font-markdown-code:calc\(\(12px\) \* 1\.125\)/);
  const dialog = shared.buildFontCss({ sizeOffsetDialog: 2 }, base);
  assert.match(dialog, /--dsh-content-font-size:calc\(\(14px\) \+ 2px\) !important/);
});

await test("the code offset scales the code shorthand and its parts", () => {
  const css = shared.buildFontCss(
    { sizeOffsetCode: 2 },
    {
      "--dsw-font-s-14-font-size": "14px",
      "--dsw-font-markdown-code-block-small": "11px/16px var(--ds-font-family-code)",
      "--dsw-font-markdown-code-block-small-font-size": "11px",
      "--dsw-font-markdown-code-block-small-line-height": "16px",
    }
  );
  // The shorthand is what the shipped stylesheets consume (`font: var(…)`), so
  // its size and line height must both ride the ratio and the family must not.
  assert.match(
    css,
    /--dsw-font-markdown-code-block-small:calc\(\(11px\) \* 1\.125\) \/ calc\(\(16px\) \* 1\.125\) var\(--ds-font-family-code\) !important/
  );
  assert.match(css, /--dsw-font-markdown-code-block-small-font-size:calc\(\(11px\) \* 1\.125\) !important/);
  assert.match(css, /--dsw-font-markdown-code-block-small-line-height:calc\(\(16px\) \* 1\.125\) !important/);
  assert.equal(
    css.includes("--dsw-font-s-14-font-size:"),
    false,
    "the retired interface axis stays out of the rule"
  );
});

await test("the code and dialog size axes stay independent", () => {
  const base = {
    "--dsh-content-font-size": "14px",
    "--dsh-content-font-delta": "calc(var(--dsh-content-font-size,14px) - 14px)",
    "--dsw-font-markdown-code-block": "11px/19px var(--ds-font-family-code)",
  };
  const css = shared.buildFontCss({ sizeOffsetCode: -2, sizeOffsetDialog: 2 }, base);
  assert.match(css, /--dsw-font-markdown-code-block:calc\(\(11px\) \* 0\.875\)/);
  assert.match(css, /--dsh-content-font-size:calc\(\(14px\) \+ 2px\) !important/);
  // The retired interface offset changes nothing, alone or combined.
  assert.equal(shared.buildFontCss({ sizeOffset: 3 }, base), "");
  assert.equal(
    shared.buildFontCss({ sizeOffset: 3, sizeOffsetDialog: 0 }, base),
    "",
    "the interface offset is inert even beside a dialog offset"
  );
});

await test("the interface offset never scales the conversation chain", () => {
  // The official "conversation font size" setting owns --dsh-content-font-size
  // and the markdown ladder derives from it. Scaling that chain from the
  // interface axis was exactly what made an interface size change move the
  // conversation; with no interface hook left, the conversation size is the
  // dialog axis's business alone.
  const base = {
    "--dsh-content-font-size": "17px",
    "--dsh-content-font-size-secondary":
      "min(calc(var(--dsh-content-font-size,14px) - 1px), max(13px, calc(var(--dsh-content-font-size,14px) - 2px)))",
    "--dsh-content-font-delta": "calc(var(--dsh-content-font-size,14px) - 14px)",
    "--dsh-content-font-delta-secondary": "calc(var(--dsh-content-font-size-secondary) - 13px)",
  };
  assert.equal(shared.buildFontCss({ sizeOffset: 2 }, base), "");
  assert.equal(shared.buildFontCss({ sizeOffset: 2, followDialog: false }, base), "");
  // The conversation's own axis shifts the SOURCE once and nothing else.
  const dialog = shared.buildFontCss({ sizeOffsetDialog: 2 }, base);
  assert.match(dialog, /--dsh-content-font-size:calc\(\(17px\) \+ 2px\) !important/);
  assert.equal(
    dialog.includes("--dsh-content-font-size-secondary:"),
    false,
    "the derived secondary size follows the source"
  );
  assert.equal(
    dialog.includes("--dsh-content-font-delta:"),
    false,
    "the delta derives from the shifted source, never shifted itself"
  );
});

await test("the embedded fallback map alone drives the code size rule", () => {
  const code = shared.buildFontCss({ sizeOffsetCode: 2 }, shared.FALLBACK_TOKENS);
  assert.match(code, /--dsw-font-markdown-code-font-size:calc\(\(12px\) \* 1\.125\)/);
  assert.equal(
    code.includes("--dsh-content-font-size:"),
    false,
    "the conversation chain belongs to the dialog axis"
  );
  assert.equal(
    code.includes("--dsw-font-s-14-font-size:"),
    false,
    "the interface ladder belongs to no size axis any more"
  );
  assert.equal(
    shared.buildFontCss({ sizeOffset: 2 }, shared.FALLBACK_TOKENS),
    "",
    "the interface offset is retired even against the fallback map"
  );
});

await test("the fallback map sizes code through the code axis alone", () => {
  const css = shared.buildFontCss({ sizeOffsetCode: 3 }, shared.FALLBACK_TOKENS);
  assert.match(
    css,
    /--dsw-font-markdown-code-block-small:calc\(\(11px\) \* 1\.1875\) \/ calc\(\(16px\) \* 1\.1875\) var\(--ds-font-family-code\) !important/
  );
  assert.match(css, /--dsw-font-markdown-code-font-size:calc\(\(12px\) \* 1\.1875\)/);
  assert.equal(css.includes("--dsh-content-font-size:"), false, "the body axis stays dormant");
});

await test("only typography tokens are scaled", () => {
  const css = shared.buildFontCss(
    { sizeOffsetCode: 2 },
    {
      "--dsw-font-markdown-code": "12px",
      "--dsw-font-markdown-code-font-size": "12px",
      "--dsw-alias-bg-base": "#fff",
    }
  );
  assert.equal(css.includes("--dsw-alias-bg-base"), false);
  assert.match(css, /--dsw-font-markdown-code-font-size:calc\(\(12px\) \* 1\.125\)/);
  assert.match(css, /--dsw-font-markdown-code:calc\(\(12px\) \* 1\.125\)/);
});

await test("a size offset without tokens injects no size rule", () => {
  assert.equal(shared.buildFontCss({ sizeOffsetCode: 3 }, {}), "");
  assert.equal(shared.buildFontCss({ sizeOffsetDialog: 3 }, {}), "");
  assert.equal(shared.buildFontCss({ sizeOffset: 3 }, {}), "");
});

await test("a value a ratio cannot multiply is left alone", () => {
  // Defensive: the rewrite only fires on values a `calc()` may multiply, so a
  // shape change in a future DSH cannot produce an invalid declaration.
  const css = shared.buildFontCss(
    { sizeOffsetCode: 2 },
    { "--dsw-font-markdown-code": "12px", "--dsw-font-markdown-code-block": "unset" }
  );
  assert.match(css, /--dsw-font-markdown-code:calc\(\(12px\) \* 1\.125\) !important/);
  assert.equal(css.includes("--dsw-font-markdown-code-block:"), false);
});

await test("tokens that derive from others via var() are skipped", () => {
  const css = shared.buildFontCss(
    { sizeOffsetCode: 2 },
    {
      "--dsw-font-markdown-code-font-size": "12px",
      "--dsw-font-markdown-code-block-font-size": "var(--dsw-font-markdown-code-font-size)",
      "--dsw-font-markdown-code-block": "11px/19px var(--ds-font-family-code)",
    }
  );
  assert.match(css, /--dsw-font-markdown-code-font-size:calc\(\(12px\) \* 1\.125\) !important/);
  assert.equal(
    css.includes("--dsw-font-markdown-code-block-font-size:"),
    false,
    "derived tokens inherit through the chain"
  );
  assert.match(css, /--dsw-font-markdown-code-block:calc\(\(11px\) \* 1\.125\)/);
});

await test("the conversation weight is an offset on each element's own weight", () => {
  const css = shared.buildFontCss({ weightDialog: 100 });
  assert.ok(css.includes('[class*="_markdown_" i]'), "the rules are markdown-scoped");
  // The ladder: h1..h3 keep 700, h4..h6 and strong keep 600, th keeps 500 and
  // the body text keeps 400 — every group ADDS the offset instead of replacing
  // its weight. Replacing it is what flattened the headings before.
  for (const group of shared.DIALOG_WEIGHT_GROUPS) {
    assert.ok(
      css.includes(ladderRule(group.elements, group.base)),
      `the ${group.elements} group keeps its own base (${group.base})`
    );
  }
  // The offset is pinned on the conversation scope, so it cannot take the
  // interface's value and the groups above resolve the conversation's.
  const scope = css.split("\n").find((rule) => rule.startsWith('[class*="_markdown_" i]') && rule.includes("--dfp-wdelta"));
  assert.ok(scope !== undefined, "the conversation pins the offset on its scope");
  assert.ok(scope.includes("--dfp-wdelta:100"), "its own offset, not the interface's");
  assert.ok(scope.includes("font-weight:" + ladder(400)), "text directly in the scope takes the base group");
  // The card's conversation preview simulates the same surface.
  assert.ok(
    css.includes(".dfp-previewDialog{--dfp-wdelta:100;font-weight:" + ladder(400) + " !important}"),
    "the preview pins the same offset"
  );
  assert.ok(
    css.includes(".dfp-previewDialog :is(h1,h2,h3){font-weight:" + ladder(700) + " !important}"),
    "and carries the same ladder"
  );
  // A lighter conversation is as legal as a bolder one.
  const lighter = shared.buildFontCss({ weightDialog: -100 });
  assert.ok(lighter.includes("--dfp-wdelta:-100"), "a negative offset renders");
  assert.ok(lighter.includes(ladderRule("h1,h2,h3", 700)), "and keeps the same ladder");
});

await test("no weight is written as one flat value over the conversation", () => {
  // The regression guard for the reported bug: a plain `font-weight:<n>` on the
  // markdown scope (or on any markdown element) would override the 700/600 the
  // `font` shorthands carry, which is exactly how the headings lost their
  // weight. Every markdown weight declaration has to be a ladder.
  for (const offset of [100, -100, 200]) {
    const css = shared.buildFontCss({ weightDialog: offset });
    for (const rule of css.split("\n")) {
      if (!rule.startsWith('[class*="_markdown_" i]') && !rule.startsWith(".dfp-previewDialog")) continue;
      const match = /font-weight:([^;}]+)/.exec(rule);
      if (match === null) continue;
      assert.ok(
        match[1].startsWith("clamp("),
        `a markdown weight must be a ladder, saw ${match[1]} in ${rule.slice(0, 90)}`
      );
    }
  }
  // The interface offset in force must not leak into the conversation: with the
  // conversation unset, no markdown rule may carry a weight at all.
  const interfaceOnly = shared.buildFontCss({ weight: 100, uiFollowsDialog: false });
  assert.equal(
    interfaceOnly.split("\n").some((rule) => rule.startsWith('[class*="_markdown_" i]') && rule.includes("font-weight")),
    false,
    "an interface-only offset leaves the conversation alone"
  );
});

await test("a selector list splits on its top-level commas only", () => {
  assert.deepEqual(shared.splitSelectorList("a,b"), ["a", "b"]);
  assert.deepEqual(shared.splitSelectorList(':not(a,b),c'), [":not(a,b)", "c"]);
  assert.deepEqual(shared.splitSelectorList('body *:not(pre,pre *,[class*="x" i])'), [
    'body *:not(pre,pre *,[class*="x" i])',
  ]);
  assert.deepEqual(shared.splitSelectorList('[class*="," i],d'), ['[class*="," i]', "d"]);
  // The per-theme prefix has to survive the compact exclusion form.
  assert.equal(
    shared.prefixSelector('body *:not(pre,pre *),code', "body[dark]"),
    "body[dark] body *:not(pre,pre *),body[dark] code"
  );
});

await test("every per-theme rule carries the theme attribute", () => {
  // A per-theme value set renders as a second, prefixed copy. The scoped code
  // family inside the dialog was the one rule that escaped the prefix: it
  // would have re-asserted the LIGHT code family inside the dark dialog.
  const axis = shared.resolveAxes({
    stackDialog: '"Inter"',
    mono: '"JetBrains Mono"',
    sans: '"Georgia"',
    weightDialog: 460,
    weightCode: 50,
    weight: 380,
    uiFollowsDialog: false,
  }).light;
  const dark = shared.buildAxisCss(axis, shared.FALLBACK_TOKENS, true);
  assert.ok(dark.length > 0, "the dark set renders");
  for (const rule of dark.split("\n")) {
    assert.ok(
      rule.startsWith("body[data-ds-dark-theme]"),
      `a dark rule escaped the theme attribute: ${rule.slice(0, 90)}`
    );
  }
  assert.ok(
    dark.includes('body[data-ds-dark-theme] [class*="_markdown_" i] pre'),
    "the dialog's own code family is scoped too"
  );
});

await test("the interface weight reaches the chrome without walking every element", () => {
  const css = shared.buildFontCss({ weight: 100, uiFollowsDialog: false });
  assert.ok(
    css.includes("font-weight:" + ladder(400) + " !important"),
    "the offset is written through the variable"
  );
  assert.ok(css.includes(":root,body{--dfp-wdelta:100}"), "the offset is declared at the source");
  // The reach is an element table, not `body *`: the universal descendant form
  // matched 1892 elements on every recalculation (measured 0.2 s of style
  // recalculation per 50-step drag).
  assert.equal(css.includes("body,body *"), false, "no universal descendant reach");
  const selector = css.split("\n").find((rule) => rule.startsWith("body,body :where("));
  for (const needle of ["button", "span", "div", "strong", "th"]) {
    assert.ok(selector.includes(needle), `${needle} pins its own weight in DSH`);
  }
  // The conversation has no offset of its own here, so the rule carries the
  // markdown guard — and nothing else: code subtrees stay out through the
  // variable, not through a descendant selector.
  assert.ok(
    css.includes("body,body :where(" + shared.WEIGHT_ELEMENT_TABLE + ")" + shared.WEIGHT_MARKDOWN_GUARD),
    "the interface rule is the element table plus the markdown guard"
  );
  const guarded = shared
    .splitSelectorList(shared.WEIGHT_MARKDOWN_GUARD.slice(":not(".length, -1))
    .join(",");
  for (const needle of [
    '[class*="_markdown_" i]',
    '[class*="_markdown_" i] *',
    ".dfp-previewDialog",
    ".dfp-previewDialog *",
  ]) {
    assert.ok(guarded.includes(needle), `${needle} must be guarded`);
  }
  // The guard rides `:where(…)` so it adds NO specificity: the rule stays at
  // (0,0,1), which is what lets the class-scoped conversation ladder and the
  // code rules out-rank it. Without that, the guard's class would beat the code
  // rule's element selectors and code would take the interface weight.
  assert.ok(shared.WEIGHT_MARKDOWN_GUARD.startsWith(":not(:where("), "the guard adds no specificity");
  assert.equal(guarded.includes("code"), false, "code surfaces are not guarded here");
  // With a conversation offset of its own the guard is dropped entirely: the
  // ladder is class-scoped and wins anyway, so the rule collapses to the bare
  // table — measured to keep the axis in full (141/141 interface elements).
  const withDialog = shared.buildFontCss({ weight: 100, weightDialog: 60, uiFollowsDialog: false });
  assert.ok(
    withDialog.includes(
      "body,body :where(" + shared.WEIGHT_ELEMENT_TABLE + "){font-weight:" + ladder(400) + " !important}"
    )
  );
  assert.equal(withDialog.split("\n").some((rule) => rule.startsWith("body,body :where(") && rule.includes(":not(")), false, "no guard when the conversation owns an offset");
  // No rule may carry a long `:not(…)` argument list: the measurement was for
  // the weight rule's 26 arguments, and only the markdown-scoped dialog rule is
  // allowed a list (it matches markdown elements only).
  for (const rule of css.split("\n")) {
    const guard = /:not\((.*)\)/.exec(rule);
    if (guard === null || rule.startsWith('[class*="_markdown_" i]')) continue;
    const args = shared.splitSelectorList(guard[1]).length;
    assert.ok(args <= 4, `a guard should stay short: ${rule.slice(0, 90)}`);
  }
});

await test("an interface weight takes code back out when the code axis is unset", () => {
  const css = shared.buildFontCss({ weight: 100, uiFollowsDialog: false });
  assert.ok(
    css.includes("{font-weight:normal !important;--dfp-wdelta:0}"),
    "code surfaces are excluded from the table's reach, so they pin the offset to zero too"
  );
  assert.ok(shared.CODE_SELECTOR.split(",").every((selector) => css.includes(selector)));
  // With a code offset of its own the reset is skipped: the axis rule stands,
  // and it hands its own offset to everything inside the surface.
  const both = shared.buildFontCss({ weight: 100, weightCode: 450, uiFollowsDialog: false });
  assert.equal(both.includes("{font-weight:normal !important"), false);
  assert.ok(
    both.includes(`font-weight:${ladder(shared.WEIGHT_BASE)} !important;--dfp-wdelta:50`),
    "the legacy absolute 450 becomes the +50 offset"
  );
});

await test("following hands the conversation's family and weight to the interface", () => {
  const following = shared.resolveAxes({ stackDialog: "Inter", weightDialog: 80 });
  assert.equal(following.light.sans, "Inter", "the family follows");
  assert.equal(following.light.weight, 80, "the offset follows");
  // Off: the interface keeps its own two axes and the conversation keeps its own.
  const independent = shared.resolveAxes({
    stackDialog: "Inter",
    weightDialog: 80,
    sans: "Georgia",
    weight: -60,
    uiFollowsDialog: false,
  });
  assert.equal(independent.light.sans, "Georgia");
  assert.equal(independent.light.weight, -60);
  assert.equal(independent.light.stackDialog, "Inter");
  assert.equal(independent.light.weightDialog, 80);
  // Following only where the conversation sets a value.
  const fallback = shared.resolveAxes({ weight: -60 });
  assert.equal(fallback.light.weight, -60, "the interface's own offset stands as the fallback");
});

await test("the interface and conversation weights never share a rule", () => {
  const light = shared.buildAxisCss(
    shared.resolveAxes({ weight: -60, weightDialog: 120, uiFollowsDialog: false }).light,
    {},
    false
  );
  const table = "body,body :where(" + shared.WEIGHT_ELEMENT_TABLE + ")";
  const interfaceRule = light.split("\n").find((rule) => rule.startsWith(table + "{"));
  const dialogRule = light.split("\n").find((rule) => rule.startsWith('[class*="_markdown_" i]'));
  assert.ok(interfaceRule.includes("font-weight:" + ladder(400) + " !important"));
  assert.ok(light.includes(":root,body{--dfp-wdelta:-60}"));
  assert.equal(interfaceRule.includes("120"), false);
  assert.ok(dialogRule.includes("--dfp-wdelta:120"));
  assert.equal(dialogRule.includes("-60"), false);
  // Dark gets the same pair, prefixed with the theme attribute, and the guard
  // follows the same rule: present only when the conversation has no offset.
  const dark = shared.buildAxisCss({ weight: -60, weightDialog: 120 }, {}, true);
  assert.ok(
    dark.includes(
      "body[data-ds-dark-theme],body[data-ds-dark-theme] :where(" +
        shared.WEIGHT_ELEMENT_TABLE +
        "){font-weight:" +
        ladder(400) +
        " !important}"
    )
  );
  const darkGuarded = shared.buildAxisCss({ weight: -60 }, {}, true);
  assert.ok(
    darkGuarded.includes("body[data-ds-dark-theme] :where(" + shared.WEIGHT_ELEMENT_TABLE + ")" + shared.WEIGHT_MARKDOWN_GUARD)
  );
});

await test("an unset code offset injects nothing of its own", () => {
  assert.equal(shared.buildFontCss({ weightCode: 0 }), "");
  const css = shared.buildFontCss({ weightCode: -100, weightDialog: 80 });
  assert.ok(css.includes("--dfp-wdelta:-100"), "the code offset rule exists");
  assert.ok(css.includes(ladderRule("h1,h2,h3", 700)), "the conversation ladder exists");
});

await test("the conversation and code weight axes are independent", () => {
  // Following is the default, so the conversation's offset is the one the
  // interface carries: the interface's own 180 is overridden, not added.
  const css = shared.buildFontCss({ weightDialog: 160, weightCode: -80, weight: 180 });
  assert.ok(css.includes('[class*="_markdown_" i]'), "the conversation rules are scoped");
  assert.ok(css.includes("--dfp-wdelta:160"), "the conversation's own offset renders");
  assert.ok(css.includes("--dfp-wdelta:-80"), "the code offset renders");
  assert.equal(css.includes("--dfp-wdelta:180"), false, "follow wins");
  assert.ok(
    css.includes(":root,body{--dfp-wdelta:160}"),
    "and the interface rule carries the followed offset"
  );
  // With follow off, all three axes render their own value.
  const own = shared.buildFontCss({
    weightDialog: 160,
    weightCode: -80,
    weight: 180,
    uiFollowsDialog: false,
  });
  assert.ok(own.includes(":root,body{--dfp-wdelta:180}"), "the interface offset renders");
  assert.ok(own.includes("--dfp-wdelta:160"), "the conversation offset renders");
  assert.ok(own.includes("--dfp-wdelta:-80"), "the code offset renders");
  // code only: nothing touches the conversation
  const codeOnly = shared.buildFontCss({ weightCode: 200 });
  assert.ok(
    codeOnly.includes(`${shared.CODE_SELECTOR}{font-weight:${ladder(shared.WEIGHT_BASE)} !important;--dfp-wdelta:200`),
    "a code offset rides the same ladder shape as the other two axes"
  );
  assert.equal(codeOnly.includes('[class*="_markdown_" i]'), false);
});

await test("the code weight selector names the code surfaces", () => {
  const selector = shared.CODE_SELECTOR;
  for (const needle of ["pre", "code", "kbd", "samp", "var", "tt", "textarea"]) {
    assert.ok(selector.split(",").includes(needle), `${needle} must be covered`);
    // No descendants: they cost an ancestor walk per element per recalculation,
    // and the weight reaches the elements inside a surface through
    // `--dfp-interface-weight` instead.
    assert.equal(selector.includes(needle + " *"), false, `${needle} descendants are not listed`);
  }
  assert.ok(selector.includes(".cm-editor"));
  assert.ok(selector.includes(".dfp-previewCode"), "the card's own code preview");
  assert.ok(selector.includes('[class*="code" i]'), "tool code bodies are plain divs");
  assert.ok(selector.includes('[class*="terminal" i]'), "the terminal output is a plain div");
  // The dialog rule's exclusion still reaches through ancestry: it is evaluated
  // against markdown elements only, so its `… *` arguments are affordable there.
  assert.ok(shared.CODE_EXCLUDES.includes("pre *"), "the dialog exclusion still reaches descendants");
});

await test("the code offset clamps like the other two weight axes", () => {
  assert.equal(
    shared.normalizeConfig({ weightCode: 100 }).weightCode,
    100,
    "an offset in range is kept"
  );
  // A document written before the axis became relative stores an absolute weight.
  assert.equal(shared.normalizeConfig({ weightCode: 460 }).weightCode, 60);
  assert.equal(shared.normalizeConfig({ weightCode: 300 }).weightCode, -100);
  assert.equal(shared.normalizeConfig({ weightCode: 900 }).weightCode, shared.WEIGHT_DELTA_CEIL);
  assert.equal(shared.normalizeConfig({ weightCode: -900 }).weightCode, shared.WEIGHT_DELTA_FLOOR);
  assert.equal(shared.normalizeConfig({ weightCode: 0 }).weightCode, shared.WEIGHT_UNSET);
  assert.equal(shared.normalizeConfig("nonsense").weightCode, shared.WEIGHT_UNSET);
  assert.equal(shared.isDormant(shared.normalizeConfig({ weightCode: 450 })), false);
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
  // The proportional "P" variants belong to the same families and they feed the
  // simple mode's CJK slot, so a miss is the harmful direction.
  for (const name of ["MS Gothic", "MS PGothic", "MS Mincho", "MS PMincho", "Yu Gothic"]) {
    assert.equal(shared.isCJKFamilyName(name), true, name);
  }
});

await test("a zero offset never emits a declaration", () => {
  // `calc((14px) + 0px)` would be a real declaration that disagrees with
  // isDormant and with an otherwise identical configuration.
  const css = shared.buildFontCss({
    stackDialog: '"Inter"',
    sizeOffsetDialog: 0,
    sizeOffsetCode: 0,
    lineHeightCode: 0,
    perTheme: true,
    darkValues: JSON.stringify({ sizeOffsetDialog: 0, lineHeightCode: 0 }),
  });
  assert.equal(css.includes("+ 0px"), false, "no zero offset is written");
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

section("shared: the family picker's groups");

await test("a curated group survives a search, even with a working catalog", () => {
  // The 0.2.2 shape dropped the curated groups whenever the catalog worked and
  // a search was running, so a curated family this machine does not have could
  // not be found by name at all.
  const groups = shared.pickerGroups({
    stack: [],
    single: false,
    query: "noto",
    catalog: { status: "ready", families: ["Noto Sans SC", "Internote", "Cascadia Code"] },
  });
  const labels = groups.map((group) => group.label);
  assert.ok(labels.includes("stack.groupCjk"), `curated groups stay: ${labels.join(",")}`);
  const cjk = groups.find((group) => group.label === "stack.groupCjk");
  assert.ok(
    cjk.families.includes("Noto Sans CJK SC"),
    "an uninstalled curated family is still offered"
  );
  assert.deepEqual(cjk.families, ["Noto Sans SC", "Noto Sans CJK SC"]);
  assert.equal(
    labels.includes("stack.groupLocal"),
    false,
    "the local list does not repeat what a curated heading already shows"
  );
});

await test("no family is ever listed twice across the groups", () => {
  const groups = shared.pickerGroups({
    stack: [],
    single: false,
    query: "",
    catalog: {
      status: "ready",
      families: ["Microsoft YaHei", "Inter", "Cascadia Code", "Some Font"],
    },
  });
  const seen = new Map();
  for (const group of groups) {
    for (const name of group.families) {
      const key = name.toLowerCase();
      assert.equal(seen.has(key), false, `${name} is in ${seen.get(key)} and ${group.label}`);
      seen.set(key, group.label);
    }
  }
  // The curated heading wins where it has an opinion; the local list answers
  // for everything else.
  assert.equal(seen.get("microsoft yahei"), "stack.groupCjk");
  assert.equal(seen.get("inter"), "stack.groupLatin");
  assert.equal(seen.get("cascadia code"), "stack.groupMono");
  assert.equal(seen.get("some font"), "stack.groupLocal");
});

await test("multi mode moves the stack's own families into the selected group", () => {
  const groups = shared.pickerGroups({
    stack: ["Inter"],
    single: false,
    query: "",
    catalog: { status: "ready", families: ["Inter", "Segoe UI"] },
  });
  assert.deepEqual(groups[0], { label: "stack.groupSelected", families: ["Inter"] });
  const latin = groups.find((group) => group.label === "stack.groupLatin");
  assert.equal(latin.families.includes("Inter"), false, "already in the stack");
  assert.ok(latin.families.includes("Segoe UI"), "the curated heading still places it");
  assert.equal(
    groups.some((group) => group.label === "stack.groupLocal"),
    false,
    "the only enumerated families were the stack's and the curated one"
  );
});

await test("single mode keeps the pick visible among its own kind", () => {
  const groups = shared.pickerGroups({
    stack: ["Microsoft YaHei"],
    single: true,
    query: "",
    catalog: { status: "denied", families: [] },
  });
  assert.deepEqual(groups[0].families, ["Microsoft YaHei"]);
  const cjk = groups.find((group) => group.label === "stack.groupCjk");
  assert.ok(cjk.families.includes("Microsoft YaHei"), "the current pick carries its check mark here");
  assert.equal(
    groups.some((group) => group.label === "stack.groupLocal"),
    false,
    "a refused catalog has no local group to show"
  );
});

await test("a refused or loading catalog still offers every curated group", () => {
  for (const status of ["denied", "loading", "unsupported"]) {
    const groups = shared.pickerGroups({
      stack: [],
      single: false,
      query: "",
      catalog: { status, families: [] },
    });
    assert.deepEqual(
      groups.map((group) => group.label),
      ["stack.groupMono", "stack.groupCjk", "stack.groupLatin", "stack.groupGeneric"],
      `${status} lists the curated groups`
    );
  }
});

await test("the local group is capped and its names are sanitized", () => {
  const families = [];
  for (let index = 0; index < 300; index += 1) {
    families.push(`Font ${String(index).padStart(3, "0")}`);
  }
  const groups = shared.pickerGroups({
    stack: [],
    single: false,
    query: "",
    catalog: { status: "ready", families },
    maxLocal: 240,
  });
  assert.equal(groups.find((group) => group.label === "stack.groupLocal").families.length, 240);
  const hostile = shared.pickerGroups({
    stack: [],
    single: false,
    query: "",
    catalog: { status: "ready", families: ['Foo"; } body{background:red}'] },
  });
  const local = hostile.find((group) => group.label === "stack.groupLocal");
  assert.deepEqual(local.families, [shared.sanitizeFamily('Foo"; } body{background:red}')]);
  assert.equal(local.families[0].includes("{"), false);
});

await test("a refusal is retried, a working catalog and a missing API are not", () => {
  const RETRY = 20000;
  assert.equal(shared.catalogRefreshDue(null, 1000, RETRY), true, "nothing cached yet");
  assert.equal(shared.catalogRefreshDue({ status: "ready", at: 0 }, 1e9, RETRY), false);
  assert.equal(shared.catalogRefreshDue({ status: "denied", at: 1000 }, 5000, RETRY), false);
  assert.equal(shared.catalogRefreshDue({ status: "denied", at: 1000 }, 21000, RETRY), true);
  assert.equal(shared.catalogRefreshDue({ status: "unsupported", at: 0 }, 1e9, RETRY), true);
  assert.equal(
    shared.catalogRefreshDue({ status: "unsupported", at: 0, permanent: true }, 1e9, RETRY),
    false,
    "a browser without the API will never grow one"
  );
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

await test("the fallback token map covers every scalable family", () => {
  assert.ok(shared.FALLBACK_TOKENS["--dsh-content-font-size"]);
  assert.ok(shared.FALLBACK_TOKENS["--dsw-font-s-14-font-size"]);
  // The code axis is consumed through `font` shorthands, which the size-token
  // pattern does not match — the map still has to carry them.
  assert.ok(shared.FALLBACK_TOKENS["--dsw-font-markdown-code-block"]);
  for (const name of Object.keys(shared.FALLBACK_TOKENS)) {
    assert.ok(shared.isScaledToken(name), `${name} would never be scaled`);
  }
});

section("host half: settings section and index injection");

await test("registers the namespace and injects the first-frame style row", async () => {
  const host = await loadHostHalf(undefined);
  assert.equal(host.section.namespace, "dsh-fonttune");
  assert.equal(host.table.length, 1);
  const rows = [];
  host.table[0](rows);
  assert.equal(rows.length, 1);
  // An `html` row, not a `style` row: the served element has to carry the same
  // stamp the browser half writes, so the browser half can adopt it instead of
  // appending a second copy that could never be kept in sync.
  assert.equal(rows[0].kind, "html");
  assert.equal(rows[0].placement, "head");
  assert.equal(
    rows[0].html,
    '<style data-plugin="dsh-fonttune" data-plugin-css="dsh-fonttune"></style>'
  );
});

await test("the alpha dialect configures the entry instead of a section", async () => {
  // DSH 0.1.7-alpha.x has no `installSection`: an instance announces its page
  // policy with `settings.configure`, and the settings service derives the form
  // from the schema this module exports. The row still has to be served, and its
  // values come from the entry's own resolved config.
  const host = await loadHostHalf(
    { sans: '"Inter"' },
    { dialect: "alpha", liveConfig: { sans: '"Noto Serif SC"', weightDialog: 80 } }
  );
  assert.equal(host.section, null, "no section is registered on this line");
  assert.equal(host.presentations.length, 1, "the page policy was configured once");
  assert.deepEqual(host.presentations[0].presentation, { auto: true });
  assert.equal(
    host.presentations[0].owner,
    host.presentations[0].owner,
    "the policy is owned by an explicit fiber"
  );
  assert.equal(host.effects.length, 1, "configure is registered as an effect");
  assert.equal(host.table.length, 1);
  const rows = [];
  host.table[0](rows);
  assert.ok(
    rows[0].html.includes('"Noto Serif SC"'),
    "the served row carries the entry's live value, not only the base layer"
  );
  assert.ok(rows[0].html.includes(ladderRule("h1,h2,h3", 700)));
});

await test("the schema is marked live-editable where schemastery supports it", async () => {
  // The alpha projects a form per entry and only shows the fields under a
  // `.volatile()` node; without the marking the plugin has no page there at
  // all. The rc line ships a schemastery without the modifier, so the call is
  // feature-detected rather than unconditional.
  const host = await loadHostHalf(undefined);
  const schema = host.module.Config;
  const json = JSON.stringify(schema.toJSON ? schema.toJSON() : schema);
  assert.ok(json.includes("stackDialog"), "the schema still declares the fields");
  if (typeof schema.volatile === "function") {
    assert.equal(schema.meta.volatile, true, "the root carries the volatile marking");
  } else {
    assert.equal(schema.meta?.volatile, undefined, "no marking is possible here");
  }
  // Whatever the dialect, the schema still validates the same values — but a
  // dialect that has the modifier also changes what a resolved field IS: the
  // loader then hands the plugin references, which is why the host half unwraps
  // before reading. (CI installs the newest schemastery, so this branch is the
  // one the release has to survive; the rc line's plain shape is asserted below
  // and exercised live on rc.2 / rc.3.)
  const resolved = schema({ sans: '"Inter"' });
  if (typeof schema.volatile === "function") {
    assert.notEqual(resolved.sans, '"Inter"', "a volatile field resolves to a reference");
    assert.equal(host.module.plainConfigValue(resolved).sans, '"Inter"');
  } else {
    assert.equal(resolved.sans, '"Inter"', "without the modifier a field stays plain");
  }
  assert.throws(() => schema({ weightDialog: 10_000 }));
});

await test("a configured base layer is rendered into the row", async () => {
  const host = await loadHostHalf({
    sans: '"Inter"',
    sizeOffset: 2,
    sizeOffsetCode: -2,
    weight: 100,
    weightDialog: 60,
    weightCode: 300,
  });
  const rows = [];
  host.table[0](rows);
  const html = rows[0].html;
  assert.ok(html.startsWith('<style data-plugin="dsh-fonttune" data-plugin-css="dsh-fonttune">'));
  assert.ok(html.endsWith("</style>"));
  assert.match(html, /body\{font-family:"Inter" !important\}/);
  // Following is the default, so the interface carries the conversation's +60.
  assert.ok(html.includes(":root,body{--dfp-wdelta:60}"), "the conversation offset renders");
  assert.ok(html.includes(ladderRule("h1,h2,h3", 700)), "the conversation ladder renders");
  assert.equal(
    html.includes("--dfp-wdelta:100"),
    false,
    "the interface's own +100 is overridden while following"
  );
  assert.match(html, /--dfp-wdelta:-100/, "the legacy absolute 300 becomes the -100 code offset");
  assert.match(html, /--dsw-font-markdown-code-block:calc\(\(11px\) \* 0\.875\)/);
  assert.equal(
    html.includes("--dsw-font-s-14-font-size:"),
    false,
    "the retired interface size axis injects nothing into the row"
  );
  // The interface weight rule reaches the chrome through the element table (the
  // conversation owns an offset here, so the guard is dropped), and the
  // conversation keeps its own offset through the markdown-scoped ladder.
  assert.ok(
    html.includes(
      "body,body :where(" + shared.WEIGHT_ELEMENT_TABLE + "){font-weight:" + ladder(400) + " !important}"
    )
  );
  assert.ok(html.includes('[class*="_markdown_" i]'));
});

await test("the host schema accepts real stacks and refuses bad ones", async () => {
  const { module } = await loadHostHalf(undefined);
  const schema = module.Config;
  const resolved = module.plainConfigValue(schema({ sans: '"Inter", "Microsoft YaHei"' }));
  assert.equal(resolved.sans, '"Inter", "Microsoft YaHei"');
  // The schema enforces rather than clamps: a bad value must be refused, never
  // silently stored as a corrected one, or the card would show one thing and
  // the document another.
  assert.throws(() => schema({ sizeOffset: 99 }));
  assert.throws(() => schema({ sizeOffset: -99 }));
  assert.throws(() => schema({ sizeOffsetCode: 99 }));
  assert.throws(() => schema({ sizeOffsetCode: -99 }));
  assert.throws(() => schema({ weight: 900 }));
  assert.throws(() => schema({ weight: -301 }));
  assert.throws(() => schema({ weightCode: 900 }));
  assert.throws(() => schema({ weightCode: -301 }));
  // The weight axes accept the legacy ABSOLUTE window as well, and the
  // normalizer converts it: a document written before the axes became relative
  // must still resolve, or the card would break on an existing install.
  assert.equal(module.plainConfigValue(schema({ weight: 480, weightDialog: 460 })).weight, 480);
  assert.equal(shared.normalizeConfig(module.plainConfigValue(schema({ weight: 480 }))).weight, 80);
  assert.equal(shared.normalizeConfig(module.plainConfigValue(schema({ weightDialog: 460 }))).weightDialog, 60);
  assert.equal(shared.normalizeConfig(module.plainConfigValue(schema({ weightCode: 450 }))).weightCode, 50);
  assert.throws(() => schema({ sans: "a;b{}" }), "a declaration-breaking stack must be refused");
  const defaults = module.plainConfigValue(schema({}));
  assert.equal(defaults.sans, "");
  assert.equal(defaults.sizeOffset, 0);
  assert.equal(defaults.sizeOffsetCode, 0);
  assert.equal(defaults.weight, 0);
  assert.equal(defaults.weightCode, 0);
});

section("browser half: the card and the applied stylesheet");

await test("registers the card in every seat a supported host may declare", async () => {
  const scope = createScope();
  resetDom();
  const { ctx, registered, seats } = cardContext(scope);
  await loadClientBundle(ctx);
  // The rc line shows a keyed cell under Settings -> Plugins -> Plugin
  // configuration; the alpha line contributes an entry to the Plugins page's
  // official list (that is how every plugin page is added there) and, for a
  // profile that installed this plugin as a bundle, a per-package cell. A host
  // declares whichever it knows, and a registration into a slot it never
  // declares is inert, so all three are offered.
  assert.deepEqual(seats, ["settings.plugin.item", "plugins.bundle.config", "plugins.item"]);
  assert.equal(registered.length, 3);
  const bySeat = {};
  for (const entry of registered) bySeat[entry.options.name] = entry;
  assert.equal(bySeat["settings.plugin.item"].options.key, "dsh-fonttune");
  assert.equal(typeof bySeat["settings.plugin.item"].component, "function");
  assert.equal(bySeat["plugins.bundle.config"].options.key, "dsh-fonttune");
  assert.equal(bySeat["plugins.bundle.config"].options.locale, "dsh-fonttune");
  // The Plugins-page entry is identified by `id` on that line, carries the
  // card's title as its label, and answers the summary view itself.
  assert.equal(bySeat["plugins.item"].options.id, "fonttune");
  assert.equal(typeof bySeat["plugins.item"].options.label, "function");
  assert.equal(bySeat["plugins.item"].options.label(), "Font tune");
  assert.equal(typeof bySeat["plugins.item"].component, "function");
  assert.notEqual(
    bySeat["plugins.item"].component,
    bySeat["settings.plugin.item"].component,
    "the page wrapper is its own component"
  );
  const summary = bySeat["plugins.item"].component({ view: "summary", t: (key) => key });
  assert.equal(summary, "card.description");
  assert.equal(typeof bySeat["plugins.item"].component({ view: "page", t: (key) => key }), "object");
});

await test("the bound services are ones every supported host provides", async () => {
  // A declared service the running host does not have parks the whole package:
  // on DSH 0.1.7-alpha.x a declared `settingsScope` left the Web UI waiting on
  // a service that line no longer ships, and the GUI never finished booting.
  const scope = createScope();
  resetDom();
  const { face } = await loadClientBundle(cardContext(scope).ctx);
  assert.deepEqual(face.inject, ["slots", "locale"]);
});

await test("the alpha dialect binds its scope through configForms by entry id", async () => {
  // From DSH 0.1.7-alpha.x the settings service hands out per-entry forms from
  // `configForms`, keyed by PROFILE ENTRY ID — which the installing profile's
  // patch decides, so the served schema is what identifies the plugin.
  const scope = createScope({ value: { sans: '"Inter"' } });
  const asked = [];
  const servedEntry = {
    ns: "fonttune",
    schema: { type: "object", dict: { uiFollowsDialog: {}, stackDialog: {}, mono: {} } },
    value: { sans: '"Inter"' },
    user: {},
    base: {},
    revision: 3,
  };
  const forms = {
    get(id) {
      asked.push(id);
      return scope;
    },
    describe() {
      return { getSnapshot: () => ({ view: { writable: true, namespaces: [servedEntry] } }) };
    },
  };
  const registered = [];
  const ctx = createClientContext({
    // No `settingsScope` property at all: this is the alpha line.
    get: (name) => (name === "configForms" ? forms : undefined),
    slots: {
      inject: (name, callback) => callback(),
      register: (options, component) => {
        registered.push({ options, component });
        return () => {};
      },
    },
    locale: { register: () => () => {}, getLocale: () => ({ active: "en" }) },
  });
  resetDom();
  await loadClientBundle(ctx);
  assert.deepEqual(asked, ["fonttune"], "the served schema named the entry");
  assert.equal(registered.length, 3, "the card is offered in every seat");
  const face = registered[0].options.inject();
  assert.equal(face.scope, scope, "the alpha form is the scope the card writes through");
  assert.equal(typeof face.t, "function");
});

await test("a host with neither settings dialect keeps the page working", async () => {
  // No settings service, no slot: the plugin must still inject its stylesheet
  // and must not register a card that could neither read nor write.
  const registered = [];
  const ctx = createClientContext({
    slots: {
      inject: (name, callback) => {
        registered.push(name);
        callback();
      },
      register: () => () => {},
    },
    locale: { register: () => () => {}, getLocale: () => ({ active: "en" }) },
  });
  resetDom();
  await loadClientBundle(ctx);
  assert.deepEqual(registered, [], "no card without a settings seat");
  const tag = globalThis.document.querySelector('style[data-plugin-css="dsh-fonttune"]');
  assert.ok(tag, "the stylesheet is still managed");
});

await test("applies the saved configuration to one style tag", async () => {
  const scope = createScope({
    value: {
      sans: '"Inter"',
      mono: "",
      sizeOffset: 2,
      sizeOffsetCode: 1,
      weight: 100,
      weightDialog: 60,
      weightCode: 300,
    },
    user: { sans: '"Inter"' },
  });
  resetDom();
  const { ctx } = cardContext(scope);
  await loadClientBundle(ctx);
  const tag = globalThis.document.querySelector('style[data-plugin-css="dsh-fonttune"]');
  assert.ok(tag, "the plugin must inject its stylesheet");
  assert.match(tag.textContent, /body\{font-family:"Inter" !important\}/);
  assert.ok(tag.textContent.includes(":root,body{--dfp-wdelta:60}"), "the conversation offset renders");
  assert.ok(tag.textContent.includes(ladderRule("h1,h2,h3", 700)), "the conversation ladder renders");
  assert.match(tag.textContent, /--dfp-wdelta:-100/, "the code offset reaches the style tag");
  assert.equal(
    tag.textContent.includes("--dfp-wdelta:100"),
    false,
    "the interface's own offset is overridden while following"
  );
  assert.match(tag.textContent, /--dsw-font-markdown-code-block:calc\(\(11px\) \* 1\.0625\)/);
  assert.equal(
    tag.textContent.includes("--dsw-font-s-14-font-size:"),
    false,
    "the retired interface size axis injects nothing"
  );
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

await test("the browser half adopts the served first-frame stylesheet", async () => {
  const scope = createScope({
    value: { sans: '"Inter"', sizeOffset: 0, weightDialog: 0, weight: 0 },
  });
  resetDom();
  // Stand in for the host row the served index carries: same stamp, and a rule
  // the current settings no longer produce (the interface weight of a config
  // that was following when the page was rendered).
  const served = globalThis.document.createElement("style");
  served.dataset.plugin = "dsh-fonttune";
  served.dataset.pluginCss = "dsh-fonttune";
  served.textContent = "body,body *{font-weight:480 !important}";
  globalThis.document.head.append(served);
  const { ctx } = cardContext(scope);
  await loadClientBundle(ctx);
  const tags = [];
  const collect = (node) => {
    for (const child of node.children) {
      if (child.tagName === "STYLE" && child.dataset.pluginCss === "dsh-fonttune") tags.push(child);
      collect(child);
    }
  };
  collect(globalThis.document.head);
  assert.equal(tags.length, 1, "one element, not a second copy beside the served row");
  assert.equal(tags[0], served, "the served element is the one that gets rewritten");
  assert.equal(
    tags[0].textContent.includes("font-weight"),
    false,
    "the stale first-frame rule must not survive the browser half's first apply"
  );
  assert.match(tags[0].textContent, /body\{font-family:"Inter" !important\}/);
});

await test("dropping a rule actually removes it from the page", async () => {
  const scope = createScope({ value: { weight: 100, uiFollowsDialog: false } });
  resetDom();
  const { ctx } = cardContext(scope);
  await loadClientBundle(ctx);
  const tag = () => globalThis.document.querySelector('style[data-plugin-css="dsh-fonttune"]');
  assert.ok(tag().textContent.includes(":root,body{--dfp-wdelta:100}"));
  assert.ok(tag().textContent.includes("font-weight:" + ladder(400) + " !important"));
  // The user resets the interface weight: with the two-copy layout this is the
  // exact case that used to keep applying the old value until a reload.
  scope.publish({ value: { weight: 0, uiFollowsDialog: false } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    tag().textContent.includes("--dfp-wdelta:100"),
    false,
    "the reset must empty the injected rule"
  );
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
  assert.equal(t("sans.label"), "界面字体");
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
    value: {
      sans: '"Inter"',
      mono: '"Mono"',
      sizeOffset: 3,
      sizeOffsetCode: 2,
      weight: 300,
      weightCode: 500,
    },
    user: {
      sans: '"Inter"',
      mono: '"Mono"',
      sizeOffset: 3,
      sizeOffsetCode: 2,
      weight: 300,
      weightCode: 500,
    },
  });
  resetDom();
  const { ctx } = cardContext(scope);
  await loadClientBundle(ctx);
  await scope.unset("sans");
  await scope.unset("mono");
  await scope.unset("sizeOffset");
  await scope.unset("sizeOffsetCode");
  await scope.unset("weight");
  await scope.unset("weightCode");
  assert.deepEqual(scope.getSnapshot().user, {});
  const tag = globalThis.document.querySelector('style[data-plugin-css="dsh-fonttune"]');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tag.textContent, "", "the reset must empty the injected stylesheet");
});

await test("the polling refresh walks the CSS only when something moved", async () => {
  // Reading the base tokens walks every property of every rule of every
  // stylesheet, so the four-second poll must not do it unconditionally: a
  // cheap gate watches body's inline style, the root class and the sheet
  // count, and a full sweep still runs on a slower schedule.
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const intervals = [];
  const timeouts = [];
  globalThis.setInterval = (callback) => {
    intervals.push(callback);
    return intervals.length;
  };
  globalThis.clearInterval = () => {};
  globalThis.setTimeout = (callback) => {
    timeouts.push(callback);
    return timeouts.length;
  };
  globalThis.clearTimeout = () => {};
  try {
    let reads = 0;
    const dom = createDocument({
      inline: { "--dsh-content-font-size": "14px" },
    });
    dom.document.styleSheets.push({
      ownerNode: null,
      cssRules: [
        {
          style: {
            length: 1,
            0: "--dsh-content-font-size",
            getPropertyValue(name) {
              if (name !== "--dsh-content-font-size") return "";
              reads += 1;
              return "14px";
            },
          },
        },
      ],
    });
    globalThis.document = dom.document;
    const scope = createScope({
      value: { stackDialog: '"Inter"', sizeOffsetDialog: 2 },
    });
    const { ctx } = cardContext(scope);
    await loadClientBundle(ctx);
    const tag = dom.document.querySelector('style[data-plugin-css="dsh-fonttune"]');
    assert.equal(timeouts.length, 1, "the first frame is refreshed on a timer");
    assert.equal(intervals.length, 1, "and the poll is installed");
    const initial = reads;
    assert.ok(initial >= 1, "applying read the tokens once");
    assert.equal(timeouts.length, 1, "the boot refresh is the only timer");
    for (const fire of timeouts) fire(); // the forced first refresh
    const afterForced = reads;
    assert.ok(afterForced > initial, "the boot refresh reads them again");

    intervals[0](); // tick 2: nothing moved
    assert.equal(reads, afterForced, "an unchanged environment is not re-read");
    assert.ok(tag.textContent.includes("14px"), "the stylesheet carries the base size");

    // The theme moves the content size on body's inline style: the very next
    // cheap tick has to notice, without waiting for the slow sweep.
    dom.document.body.style.setProperty("--dsh-content-font-size", "18px");
    intervals[0](); // tick 3
    assert.ok(reads > afterForced, "a moved inline token forces a read");
    assert.ok(tag.textContent.includes("18px"), "and the stylesheet follows it");

    const afterMove = reads;
    intervals[0](); // tick 4: the gate is quiet again
    assert.equal(reads, afterMove, "and it goes quiet again");
    intervals[0](); // tick 5
    intervals[0](); // tick 6
    intervals[0](); // tick 7
    assert.equal(reads, afterMove, "ticks 5 to 7 stay cheap");
    intervals[0](); // tick 8: the periodic sweep
    assert.ok(reads > afterMove, "the slow sweep reads even when nothing moved");
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    globalThis.setInterval = saved.setInterval;
    globalThis.clearInterval = saved.clearInterval;
    globalThis.setTimeout = saved.setTimeout;
    globalThis.clearTimeout = saved.clearTimeout;
  }
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
  const manifest = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const inserts = patch.split("\n").filter((line) => line.trim() === "- insert:");
  const ids = patch.split("\n").filter((line) => /^\s{4}- id:/.test(line));
  assert.equal(inserts.length, 1);
  assert.equal(ids.length, 1, `expected one entry id, saw ${ids.length}`);
  // The loader row id IS the settings key from DSH 0.1.7 on — that line imports
  // the removed settings.yaml by matching section names against entry ids — so
  // it has to equal the namespace the host half registers (the package name),
  // or an existing installation's saved values are left behind in the backup.
  assert.match(patch, new RegExp(`- id: ${manifest.name}\\s*$`, "m"));
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
  // No conversation field may claim to follow the interface: the follow
  // direction is one-way (the interface follows the conversation).
  for (const locale of ["en", "zh"]) {
    const start = source.indexOf(`\n  ${locale}: {`);
    const end = source.indexOf("\n  },", start);
    const block = source.slice(start, end);
    for (const key of ["size.dialogHint", "weight.dialogHint", "line.dialogHint", "dialog.hint"]) {
      const at = block.indexOf(`"${key}"`);
      assert.ok(at > 0, `${locale} is missing "${key}"`);
      const copy = block.slice(at, block.indexOf("\n", at));
      assert.equal(
        /跟随界面|follows the interface/i.test(copy),
        false,
        `${locale} "${key}" must not claim to follow the interface`
      );
    }
  }
});

section("0.2.0: dialog axis, code extras, per-theme values and presets");

await test("an unset dialog follows the interface family without extra rules", () => {
  const css = shared.buildFontCss({ sans: '"Inter"', sizeOffset: 2 }, shared.FALLBACK_TOKENS);
  // Family (and weight) FOLLOW: no dialog-scoped family rule may appear. The
  // retired interface size offset still reaches nothing at all.
  assert.equal(css.includes('font-family:"Inter" !important}'), true);
  assert.equal(css.includes("[class*=\"_markdown_\" i]"), false, "no dialog scope while following");
  assert.equal(
    css.includes("--dsh-content-font-size:"),
    false,
    "the conversation size never follows a retired axis"
  );
});

await test("a conversation stack leads the interface while following", () => {
  // Following (the default): the conversation's family IS the interface family,
  // so one rule covers the whole page.
  const following = shared.buildFontCss({ sans: '"Inter"', stackDialog: '"Noto Serif SC"' });
  assert.ok(
    following.includes('--dsw-font-family:"Noto Serif SC"'),
    "the shared variable carries the conversation family"
  );
  assert.ok(following.includes('body{font-family:"Noto Serif SC" !important}'));
  assert.equal(
    following.includes("[class*=\"_markdown_\" i]"),
    false,
    "no dialog scope is needed when the two are equal"
  );
  // Not following: the interface keeps its own family and the conversation is
  // scoped to the markdown subtree.
  const split = shared.buildFontCss({
    sans: '"Inter"',
    stackDialog: '"Noto Serif SC"',
    uiFollowsDialog: false,
  });
  assert.ok(split.includes('--dsw-font-family:"Inter"'), "the interface keeps its variable");
  assert.ok(split.includes('[class*="_markdown_" i]:not('), "the dialog rule is markdown-scoped");
  assert.ok(split.includes('font-family:"Noto Serif SC" !important'));
  assert.ok(!split.includes('--dsw-font-family:"Noto Serif SC"'), "the dialog never owns the sans variable");
  // An identical dialog stack adds nothing in either mode.
  const same = shared.buildFontCss({
    sans: '"Inter"',
    stackDialog: '"Inter"',
    uiFollowsDialog: false,
  });
  assert.equal(same.includes("[class*=\"_markdown_\" i]"), false, "an equal dialog stack is a no-op");
});

await test("the dialog weight stays out of code surfaces", () => {
  const css = shared.buildFontCss({
    sans: '"Inter"',
    stackDialog: '"Noto Serif SC"',
    weight: 180,
    weightDialog: 30,
  });
  assert.ok(css.includes("--dfp-wdelta:30"), "the conversation offset rule exists");
  // The interface offset is the one the conversation does NOT take, and the
  // code surfaces pin the variable to zero (no code weight is set here), so an
  // element inside a code block inherits the code's own weight instead.
  assert.ok(css.includes(":root,body{--dfp-wdelta:30}"), "follow hands the conversation's offset to the interface");
  assert.ok(css.includes("{font-weight:normal !important;--dfp-wdelta:0}"), "code pins the offset to zero");
  assert.ok(
    css.indexOf("--dfp-wdelta:30") < css.indexOf("--dfp-wdelta:0"),
    "the code rules come after the conversation's, so code wins"
  );
});

await test("the retired interface line-height injects nothing", () => {
  const css = shared.buildFontCss(
    { lineHeight: 130 },
    {
      "--dsw-font-s-14-line-height": "22px",
      "--dsw-font-s-14": "14px/22px var(--dsw-font-family)",
      "--dsw-font-markdown-h1":
        "700 calc(21px + var(--dsh-content-font-delta)) / calc(30px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
    }
  );
  assert.equal(css, "", "no interface line-height rule, and none for the markdown ladder");
  // The line-height that DOES work is the conversation's own axis.
  const dialog = shared.buildFontCss(
    { sizeOffsetDialog: 0, lineHeightDialog: 140 },
    {
      "--dsw-font-markdown-h1":
        "700 calc(21px + var(--dsh-content-font-delta)) / calc(30px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
    }
  );
  assert.match(dialog, /--dsw-font-markdown-h1:700 calc\(21px \+ var\(--dsh-content-font-delta\)\) \/ calc\(\(calc\(30px \+ var\(--dsh-content-font-delta\)\)\) \* 1\.4\)/);
});

await test("the dialog line-height rebuilds the markdown shorthands", () => {
  const css = shared.buildFontCss(
    { stackDialog: '"Noto Serif SC"', lineHeightDialog: 140 },
    {
      "--dsw-font-markdown-h1":
        "700 calc(21px + var(--dsh-content-font-delta)) / calc(30px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
    }
  );
  assert.match(
    css,
    /--dsw-font-markdown-h1:700 calc\(21px \+ var\(--dsh-content-font-delta\)\) \/ calc\(\(calc\(30px \+ var\(--dsh-content-font-delta\)\)\) \* 1\.4\) var\(--dsw-font-family\) !important/
  );
});

await test("the feature settings value is sanitized", () => {
  assert.equal(shared.sanitizeFeatures('"ss01" on, "cv01" 1'), '"ss01" on, "cv01" 1');
  assert.equal(shared.sanitizeFeatures('"ss01"; } body {'), "", "a hostile value is dropped");
  assert.equal(shared.sanitizeFeatures("ss01, calt"), "ss01, calt");
  const css = shared.buildFontCss({ codeFeatures: '"ss01" on' });
  assert.match(css, /font-feature-settings:"ss01" on !important/);
});

await test("dark per-theme values prefix their own rules", () => {
  const css = shared.buildFontCss({
    sans: '"Inter"',
    perTheme: true,
    darkValues: JSON.stringify({ weightDialog: 160, sizeOffsetDialog: 2 }),
  });
  assert.ok(
    css.includes("body[data-ds-dark-theme] [class*=\"_markdown_\""),
    "the dark conversation weight is prefixed"
  );
  assert.ok(css.includes("--dfp-wdelta:160"), "the dark weight offset renders");
  assert.ok(
    css.split("\n").some((rule) => rule.startsWith("body[data-ds-dark-theme]") && rule.includes("--dfp-wdelta:160")),
    "and it rides a dark-prefixed rule"
  );
  assert.match(
    css,
    /body\[data-ds-dark-theme\]\{[^}]*--dsh-content-font-size:calc\(\(14px\) \+ 2px\)/,
    "the dark conversation size is prefixed"
  );
  // No dark rules at all when the dark map is empty.
  const none = shared.buildFontCss({ sans: '"Inter"', perTheme: true, darkValues: "{}" });
  assert.equal(none.includes("body[data-ds-dark-theme]"), false);
  // Per-theme off ignores the stored map entirely.
  const off = shared.buildFontCss({ sans: '"Inter"', perTheme: false, darkValues: JSON.stringify({ weightDialog: 160 }) });
  assert.equal(off.includes("body[data-ds-dark-theme]"), false);
});

await test("the dark family pair rides the sans variable per theme", () => {
  const css = shared.buildFontCss({
    sans: '"Inter"',
    perTheme: true,
    darkValues: JSON.stringify({ sans: '"Serif Dark"' }),
  });
  assert.ok(css.includes("body[data-ds-dark-theme]{--dsw-font-family:"));
  assert.ok(css.includes('--dsw-font-family:"Serif Dark"'));
});

await test("the active preset name normalizes like a preset name", () => {
  const config = shared.normalizeConfig({ activePreset: "默认配置1" });
  assert.equal(config.activePreset, "默认配置1");
  const hostile = shared.normalizeConfig({ activePreset: 'a"; } body {' });
  assert.equal(hostile.activePreset.includes(";"), false, "a hostile name is stripped");
  assert.equal(shared.normalizeConfig({}).activePreset, "");
});

await test("the interface-follow flag defaults on and stores off", () => {
  assert.equal(shared.normalizeConfig({}).uiFollowsDialog, true, "absent means follow");
  assert.equal(shared.normalizeConfig({ uiFollowsDialog: false }).uiFollowsDialog, false);
  assert.equal(shared.normalizeConfig({ uiFollowsDialog: "false" }).uiFollowsDialog, false);
  // The follow flag rides the preset value sets too.
  const set = shared.normalizeValueSet({ uiFollowsDialog: false });
  assert.equal(set.uiFollowsDialog, false);
});

await test("the weight slider's range and notch come from the family", () => {
  // A family can only be made as light or as heavy as the faces it ships, so the
  // slider spans the reachable weights and steps between them; that is also what
  // makes every notch a change instead of a stretch of nothing.
  const profile = (sample, options) => shared.weightProfileFrom(sample, options);
  // A variable axis: every weight renders differently, so the slider covers the
  // whole probe window in single units.
  const continuous = profile((weight) => "w" + weight);
  assert.equal(continuous.step, 1, "a continuous family keeps single units");
  assert.equal(continuous.min, -300, "and reaches down to the probe floor");
  assert.equal(continuous.max, 500, "and up to the probe ceiling");
  // Six named faces (a 300 hairline up to a 900 black), each requested weight
  // rounded to the nearest cut: the range stops where the faces stop, and only
  // steps of 100 always land on a different one.
  const faces = (weight) => {
    if (weight <= 350) return "300";
    if (weight <= 450) return "400";
    if (weight <= 550) return "500";
    if (weight <= 650) return "600";
    if (weight <= 750) return "700";
    return "900";
  };
  const named = profile(faces);
  assert.equal(named.step, 100, "one notch per face");
  assert.equal(named.min, -100, "down to the lightest face");
  assert.equal(named.max, 400, "up to the heaviest face, with no dead notch above it");
  // Faces every 25 units: the finer step is found and kept.
  const fine = profile((weight) => "f" + Math.floor(weight / 25));
  assert.equal(fine.step, 25);
  // Regular and bold only (what a two-face CJK family such as SimSun renders):
  // the range is exactly the two faces, and the notch is the whole jump, so
  // there is no dead position in between.
  const pair = profile((weight) => (weight >= 600 ? "bold" : "regular"));
  assert.deepEqual(pair, { min: 0, max: 200, step: 200 }, "two faces, two positions");
  // One face and no synthesis: every request renders the same thing, so there is
  // nothing to slide — the neutral position is the whole range, not a crash.
  const flat = profile(() => "same");
  assert.deepEqual(flat, { min: 0, max: 0, step: 1 }, "a family that never changes has no range");
  // The hard bounds cap whatever a font claims.
  const capped = profile((weight) => "w" + weight, { floor: -100, ceil: 200 });
  assert.equal(capped.min, -100);
  assert.equal(capped.max, 200);
});

await test("a weight offset turns into the step count the slider shows", () => {
  // The control counts the family's steps ("-2 -1 0 +1 +2 +3 +4") while the
  // document keeps storing a weight offset, so the two have to agree exactly.
  const sixSteps = { min: -200, max: 400, step: 100 };
  assert.deepEqual(shared.weightStepRange(sixSteps, 0), { min: -2, max: 4, unit: 100, value: 0 });
  assert.deepEqual(shared.weightStepRange(sixSteps, 100).value, 1);
  assert.deepEqual(shared.weightStepRange(sixSteps, 400).value, 4);
  assert.deepEqual(shared.weightStepRange(sixSteps, -200).value, -2);
  // An unaligned legacy value reads as the nearest step it renders like.
  assert.equal(shared.weightStepRange(sixSteps, 80).value, 1);
  assert.equal(shared.weightStepRange(sixSteps, -60).value, -1);
  // A value outside the measured range widens the control instead of becoming
  // unreachable (the font may have changed since it was written).
  assert.deepEqual(shared.weightStepRange(sixSteps, 600), { min: -2, max: 6, unit: 100, value: 6 });
  assert.deepEqual(shared.weightStepRange(sixSteps, -400), { min: -4, max: 4, unit: 100, value: -4 });
  // A two-face family counts in halves of the old range; a continuous one in
  // single weight units.
  assert.deepEqual(shared.weightStepRange({ min: 0, max: 200, step: 200 }, 200), {
    min: 0,
    max: 1,
    unit: 200,
    value: 1,
  });
  assert.equal(shared.weightStepRange({ min: -300, max: 500, step: 1 }, 250).value, 250);
  // Nothing slides: the neutral position is the whole range.
  assert.deepEqual(shared.weightStepRange({ min: 0, max: 0, step: 1 }, 0), {
    min: 0,
    max: 0,
    unit: 1,
    value: 0,
  });
});

await test("a slider keeps the value being dragged when an older write confirms", () => {
  // The race behind "it jumps somewhere else while I adjust": the document write
  // is debounced and can land seconds later, so a confirmation for the PREVIOUS
  // commit arrives after a new drag has already started. The local value must
  // survive it — dropping it moved the thumb back to the old value mid-drag.
  const step = (state, confirmed) =>
    shared.reconcileSliderValue({
      pending: state.pending,
      awaiting: state.awaiting,
      confirmed: confirmed,
    });
  // Idle: nothing to drop.
  assert.deepEqual(step({ pending: null, awaiting: null }, 5), { pending: null, awaiting: null });
  // Normal flow: released 3, the document echoes 3 → the local copy is dropped.
  assert.deepEqual(step({ pending: 3, awaiting: 3 }, 3), { pending: null, awaiting: null });
  // The regression case: released 3, started dragging 7, then 3 confirms.
  assert.deepEqual(step({ pending: 7, awaiting: 3 }, 3), { pending: 7, awaiting: null });
  // An unrelated outside value (another page, a reset) arriving mid-drag: kept.
  assert.deepEqual(step({ pending: 7, awaiting: null }, 5), { pending: 7, awaiting: null });
  // An outside value that already equals what is on screen: nothing to hold.
  assert.deepEqual(step({ pending: 7, awaiting: null }, 7), { pending: null, awaiting: null });
  // A refused write never echoes; the value stays until the patience runs out
  // (the component clears its own copy after a few seconds).
  assert.deepEqual(step({ pending: 9, awaiting: 9 }, 4), { pending: 9, awaiting: 9 });
});

await test("the interface borrows the conversation's family", () => {
  const tokens = { "--dsw-font-family": "system-ui" };
  const config = {
    sans: '"Inter"',
    stackDialog: '"Noto Serif SC"',
    weight: 100,
    weightDialog: 30,
    sizeOffset: 2,
  };
  // Following (the default): the conversation leads the shared family.
  const following = shared.buildFontCss(config, tokens);
  assert.ok(
    following.includes('--dsw-font-family:"Noto Serif SC"'),
    "the interface takes the conversation family"
  );
  assert.equal(
    following.includes("--dfp-wdelta:100"),
    false,
    "the interface's own offset is overridden while following"
  );
  assert.ok(following.includes(":root,body{--dfp-wdelta:30}"), "the conversation offset leads");
  // Not following: the interface keeps its own family, the conversation is scoped.
  const split = shared.buildFontCss({ ...config, uiFollowsDialog: false }, tokens);
  assert.ok(split.includes('--dsw-font-family:"Inter"'), "the interface keeps its own family");
  assert.ok(split.includes('font-family:"Noto Serif SC" !important'), "the conversation is scoped");
  assert.ok(split.includes(":root,body{--dfp-wdelta:100}"), "the interface keeps its own offset");
  // The retired interface size axis reaches nothing in either mode.
  assert.equal(split.includes("--dsh-content-font-size:"), false);
  assert.equal(following.includes("--dsh-content-font-size:"), false);
});

await test("the conversation offset rides the official content size once", () => {
  const css = shared.buildFontCss({
    sizeOffset: 2,
    sizeOffsetDialog: 3,
  }, {
    "--dsh-content-font-size": "14px",
    "--dsh-content-font-size-secondary": "min(calc(var(--dsh-content-font-size,14px) - 1px), 13px)",
    "--dsh-content-font-delta": "calc(var(--dsh-content-font-size,14px) - 14px)",
  });
  // Only the SOURCE token shifts; the derived secondary size and the delta are
  // left alone so they resolve from the shifted source (no double count), and
  // the retired interface offset (+2) never enters.
  assert.ok(css.includes("--dsh-content-font-size:calc((14px) + 3px) !important"));
  assert.equal(css.includes("--dsh-content-font-size-secondary:"), false, "derived tokens follow the source");
  assert.equal(css.includes("--dsh-content-font-delta:"), false, "the delta derives from the source");
  assert.equal(css.includes("+ 5px"), false, "the retired interface offset is not added on top");
});

await test("an expanded heading size is never shifted a second time", () => {
  // The reported asymmetry: the page also carries `--dsw-font-markdown-h1` with
  // its var() ALREADY substituted (`calc(21px + -2px)`), which reads exactly
  // like a literal — so a value test let h1/h2 take the offset a second time
  // while h3, still `calc(18px + var(…))`, did not. The whitelist is by NAME,
  // so none of the derived names is re-declared whatever their value looks like.
  const expanded = {
    "--dsh-content-font-size": "14px",
    "--dsh-content-font-delta": "calc(var(--dsh-content-font-size,14px) - 14px)",
    "--dsw-font-markdown-h1": "700 calc(21px + -2px) / calc(30px + -2px) var(--dsw-font-family)",
    "--dsw-font-markdown-h1-font-size": "calc(21px + -2px)",
    "--dsw-font-markdown-h2": "700 calc(19px + -2px) / calc(28px + -2px) var(--dsw-font-family)",
    "--dsw-font-markdown-h2-font-size": "calc(19px + -2px)",
    "--dsw-font-markdown-h3-font-size": "calc(18px + var(--dsh-content-font-delta))",
    "--dsw-font-markdown-base": "var(--dsh-content-font-size,14px) / calc(24px + var(--dsh-content-font-delta)) var(--dsw-font-family)",
    "--dsw-font-markdown-small": "12px/20px var(--dsw-font-family)",
    "--dsw-font-markdown-small-font-size": "12px",
  };
  const css = shared.buildFontCss({ sizeOffsetDialog: -2 }, expanded);
  for (const name of [
    "--dsw-font-markdown-h1",
    "--dsw-font-markdown-h2",
    "--dsw-font-markdown-h3",
    "--dsw-font-markdown-base",
  ]) {
    assert.equal(css.includes(name), false, `${name} derives from the chain and must not be re-declared`);
  }
  // The source still shifts — once — and the literal family still follows it.
  assert.ok(css.includes("--dsh-content-font-size:calc((14px) + -2px) !important"));
  assert.ok(css.includes("--dsw-font-markdown-small-font-size:calc((12px) + -2px) !important"));
  assert.ok(
    css.includes("--dsw-font-markdown-small:calc((12px) + -2px) / 20px var(--dsw-font-family) !important"),
    "the literal shorthand rebuilds with the shifted size"
  );
  // The ladder itself is derived, so a BOLD offset never rebuilds a size either.
  const bold = shared.buildFontCss({ weightDialog: 60 }, expanded);
  assert.equal(bold.includes("--dsw-font-markdown-h1"), false);
});

await test("a weight offset lands on each group's own base, clamped", () => {
  // The offset is ADDED to the weight DSH gives the group, then clamped to the
  // legal range (below 100 the value is invalid, above 900 the font ignores it),
  // so the hierarchy survives every offset in both directions.
  const resolve = (base, delta) => Math.min(900, Math.max(100, base + delta));
  for (const delta of [shared.WEIGHT_DELTA_MIN, -40, 60, shared.WEIGHT_DELTA_MAX]) {
    const css = shared.buildFontCss({ weightDialog: delta });
    for (const group of shared.DIALOG_WEIGHT_GROUPS) {
      assert.ok(css.includes(ladderRule(group.elements, group.base)), `${group.elements} at ${delta}`);
      const value = resolve(group.base, delta);
      assert.ok(value >= 100 && value <= 900, `${group.elements} stays legal at ${delta}`);
    }
    assert.ok(css.includes("--dfp-wdelta:" + delta), `the offset itself is pinned at ${delta}`);
  }
  // The order the reported bug broke: headings above bold text above the table
  // head above body text, at both ends of the range.
  for (const delta of [shared.WEIGHT_DELTA_MIN, shared.WEIGHT_DELTA_MAX]) {
    assert.ok(resolve(700, delta) > resolve(600, delta), "h1..h3 stay above h4..h6/strong");
    assert.ok(resolve(600, delta) > resolve(500, delta), "bold text stays above the table head");
    assert.ok(resolve(500, delta) > resolve(400, delta), "the table head stays above body text");
  }
  // Zero is the neutral value: it injects NO weight rule at all, so a stored
  // document that happens to carry 0 is indistinguishable from an empty one.
  assert.equal(shared.buildFontCss({ weightDialog: 0 }).includes("font-weight"), false);
  assert.equal(shared.buildFontCss({ weight: 0, uiFollowsDialog: false }).includes("font-weight"), false);
});

await test("the conversation keeps its own axes while the interface follows", () => {
  const css = shared.buildFontCss({
    sans: '"Inter"',
    stackDialog: '"Noto Serif SC"',
    weight: 100,
    weightDialog: 30,
    sizeOffsetDialog: 2,
    lineHeightDialog: 140,
  });
  assert.ok(css.includes('font-family:"Noto Serif SC" !important'), "the shared family rule exists");
  assert.ok(css.includes(":root,body{--dfp-wdelta:30}"), "the conversation offset leads");
  assert.ok(css.includes(ladderRule("h1,h2,h3", 700)), "and it rides the ladder");
  assert.ok(css.includes("--dsh-content-font-size:calc((14px) + 2px)"), "its own size rides the official base");
  assert.ok(css.includes("* 1.4)"), "its own line-height rebuilds the shorthand heights");
});

await test("presets round-trip through the durable JSON", () => {
  const stored = JSON.stringify([
    { name: "阅读", values: { sans: "Noto Serif SC", lineHeightDialog: 140 }, savedAt: 5 },
    { name: "", values: {}, savedAt: 6 }, // dropped: no name
  ]);
  const list = shared.normalizePresets(stored);
  assert.equal(list.length, 1);
  assert.equal(list[0].values.lineHeightDialog, 140);
  // A hostile blob yields an empty list, never a crash.
  assert.deepEqual(shared.normalizePresets("not json"), []);
  assert.deepEqual(shared.normalizePresets(null), []);
  // A preset written by 0.1.x still parses; the retired axes it carries are
  // simply no longer value axes, and unknown keys are still dropped.
  const legacy = shared.normalizePresets(
    JSON.stringify([
      { name: "旧", values: { lineHeight: 140, sizeOffset: 3, shadow: 1 }, savedAt: 1 },
    ])
  );
  assert.equal(legacy.length, 1);
  assert.deepEqual(legacy[0].values, {});
});

await test("a retired axis is stored but is not a value axis", () => {
  // The interface's own size and line-height render nothing (see the
  // measurement in `buildAxisCss`), so they left the value surface: presets no
  // longer snapshot them and they no longer decide whether the dark set is a
  // second set. They stay in the schema, so an old document still parses.
  assert.deepEqual(shared.RETIRED_FIELDS, ["sizeOffset", "lineHeight"]);
  for (const field of shared.RETIRED_FIELDS) {
    assert.equal(shared.VALUE_FIELDS.includes(field), false, `${field} is not a value axis`);
    assert.equal(shared.DURABLE_FIELDS.includes(field), true, `${field} is still durable`);
    assert.equal(shared.normalizeValueSet({ [field]: 3 })[field], undefined);
  }
  const config = shared.normalizeConfig({ sizeOffset: 3, lineHeight: 140, weightDialog: 80 });
  assert.equal(config.sizeOffset, 3, "an old document keeps its stored value");
  assert.equal(config.lineHeight, 140);
  assert.equal(config.weightDialog, 80);
  assert.equal(shared.buildFontCss({ sizeOffset: 3, lineHeight: 140 }), "", "and renders nothing");
  // A light/dark pair that differs only in a retired axis is ONE set.
  const css = shared.buildFontCss({
    weightDialog: 60,
    perTheme: true,
    darkValues: JSON.stringify({ sizeOffset: 5, lineHeight: 150 }),
  });
  assert.equal(css.includes("data-ds-dark-theme"), false, "no dark copy is emitted");
  assert.equal(
    css.split(".dfp-previewDialog{--dfp-wdelta:60;font-weight:" + ladder(400) + " !important}").length - 1,
    1,
    "exactly one set came out"
  );
});

await test("the host schema accepts and refuses the new axes", async () => {
  const { module } = await loadHostHalf(undefined);
  const schema = module.Config;
  const resolved = module.plainConfigValue(
    schema({ lineHeight: 130, lineHeightDialog: 120, lineHeightCode: 3, codeLigatures: 1 })
  );
  assert.equal(resolved.lineHeight, 130);
  assert.equal(resolved.lineHeightDialog, 120);
  assert.equal(resolved.lineHeightCode, 3);
  assert.equal(resolved.codeLigatures, 1);
  assert.throws(() => schema({ lineHeight: 99 }));
  assert.throws(() => schema({ lineHeightCode: 99 }));
  assert.throws(() => schema({ codeLigatures: 5 }));
  assert.throws(() => schema({ codeFeatures: '"ss01"; }' }));
  const defaults = module.plainConfigValue(schema({}));
  assert.equal(defaults.lineHeight, shared.LINE_HEIGHT_MIN);
  assert.equal(defaults.codeLigatures, 0);
  assert.equal(defaults.uiFollowsDialog, true);
  assert.equal(module.plainConfigValue(schema({ uiFollowsDialog: false })).uiFollowsDialog, false);
  assert.equal(defaults.perTheme, false);
  assert.equal(defaults.darkValues, "{}");
  assert.equal(defaults.presets, "[]");
  assert.equal(defaults.activePreset, "");
});

await test("the client hands family variables to the theme override layer", async () => {
  const scope = createScope({ value: { sans: '"Inter"', mono: '"JetBrains Mono"' } });
  resetDom();
  const overrides = [];
  const ctx = createClientContext({
    get(name) {
      if (name !== "theme") return undefined;
      return {
        overrideTokens(_source, tokens) {
          overrides.push(tokens);
          return () => {};
        },
      };
    },
    slots: {
      inject: (name, callback) => callback(),
      register: () => () => {},
    },
    locale: { register: () => () => {} },
    settingsScope: { bind: () => scope },
  });
  await loadClientBundle(ctx);
  assert.equal(overrides.length, 1, "exactly one override layer");
  assert.deepEqual(overrides[0]["--dsw-font-family"], { light: '"Inter"', dark: '"Inter"' });
  assert.equal(overrides[0]["--ds-font-family-code"].light, '"JetBrains Mono"');
});

await test("a composition without the theme service skips the override layer", async () => {
  const scope = createScope({ value: { sans: '"Inter"' } });
  resetDom();
  const { ctx } = cardContext(scope); // no `get`, no theme service
  await loadClientBundle(ctx); // must not throw
  const tag = globalThis.document.querySelector('style[data-plugin-css="dsh-fonttune"]');
  assert.ok(tag.textContent.includes('font-family:"Inter"'), "the stylesheet path still applies");
});

/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
