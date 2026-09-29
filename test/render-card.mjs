/**
 * dsh-fonttune offline card-render checks.
 *
 * The main suite (run.mjs) loads the bundle and applies it, but the CARD
 * component only runs inside the real settings sheet. This file renders
 * `FontCard` once through a mini React hooks runtime — pre-seeding the open
 * state so the full card body (every section, the top bar and the preview)
 * is exercised — and walks the element tree for structural soundness. The
 * release-blocking crash class from 0.1.0 (a hook-order crash the apply-time
 * stubs could not see) is exactly what a render walk catches.
 *
 *   node test/render-card.mjs
 *
 * @module dsh-fonttune/test/render-card
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;

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
 * A one-shot hooks runtime. Each hook keeps a real slot in call order, so a
 * hook-count mismatch between two renders surfaces as a walk failure, and
 * the caller can pre-seed slot values (e.g. force the card open). The slot
 * store is per component: `rewind` clears it, so a nested component's hooks
 * can never read a parent's cached slot (a shared array would feed a parent's
 * state value into a child's `useMemo` cache and crash the walk spuriously).
 */
function buildReact() {
  const hooks = [];
  const sets = [];
  let cursor = 0;
  return {
    react: {
      createElement(type, props, ...children) {
        const all = (props && props.children !== undefined) || children.length > 1
          ? children
          : children[0];
        const withChildren = { ...(props ?? {}), children: all };
        return { type, props: withChildren, children };
      },
      useState(initial) {
        const i = cursor++;
        hooks[i] = hooks[i] ?? { value: typeof initial === "function" ? initial() : initial };
        return [
          hooks[i].value,
          (next) => {
            // The setter is a no-op for rendering (this runtime renders once),
            // but recording it is how a check can see what the card TRIED to
            // show — the only way to observe a status message offline.
            sets.push({ index: i, value: next });
          },
        ];
      },
      useEffect() {
        cursor += 1;
        return undefined;
      },
      useMemo(factory) {
        const i = cursor++;
        hooks[i] = hooks[i] ?? { value: factory() };
        return hooks[i].value;
      },
      useRef(value) {
        const i = cursor++;
        hooks[i] = hooks[i] ?? { current: value };
        return hooks[i];
      },
      useCallback(fn) {
        cursor += 1;
        return fn;
      },
      useSyncExternalStore(subscribe, getSnapshot) {
        cursor += 1;
        subscribe(() => {});
        return getSnapshot();
      },
    },
    rewind() {
      cursor = 0;
      hooks.length = 0;
    },
    seed(index, value) {
      hooks[index] = { value };
    },
    /** Everything the card tried to put into a state slot, in call order. */
    sets,
    /** How many hooks the last rendered component used. */
    hooksUsed() {
      return hooks.length;
    },
  };
}

const PRIMITIVES_STUB = {
  IconPlusOutline16: () => null,
  IconChevronDownOutline14: () => null,
  IconCheckOutline14: () => null,
  IconCloseFill14: () => null,
  IconSearchOutline16: () => null,
  Input: () => null,
};
const CLIENT_STUB = {
  react: null, // filled below after the stubs exist
  "react/jsx-runtime": null,
  "react-dom": { createPortal: (node) => node },
  "@deepseek-ai/dsh-client-ui-primitives": PRIMITIVES_STUB,
};

/**
 * A minimal document: the expanded card's picker panel portals to `body`, and
 * the card reads the theme attribute from `body`.
 */
globalThis.document = {
  head: { children: [], append() {}, querySelector: () => null },
  body: { hasAttribute() { return false; } },
  createElement: (tag) => ({
    tagName: String(tag).toUpperCase(),
    dataset: {},
    style: {},
    getContext: () => null,
    append() {},
    remove() {},
  }),
  querySelector: () => null,
  styleSheets: [],
};
globalThis.window = globalThis.window ?? {};
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};

/**
 * Load the built bundle through a stand-in loader and return its face.
 * The react stubs must be installed before the bundle is evaluated.
 */
async function loadFace() {
  const runtime = buildReact();
  CLIENT_STUB.react = runtime.react;
  CLIENT_STUB["react/jsx-runtime"] = runtime.react;
  const source = await readFile(join(ROOT, "lib", "client.js"), "utf8");
  const registered = [];
  globalThis.window = globalThis.window ?? {};
  globalThis.window.__ModuleLoader__ = {
    load(entry) {
      registered.push(entry);
    },
  };
  const resolve = (specifier) => {
    if (!(specifier in CLIENT_STUB) || CLIENT_STUB[specifier] === null) {
      throw new Error(`bundle required unknown module "${specifier}"`);
    }
    return CLIENT_STUB[specifier];
  };
  new Function("require", `${source}\nreturn 0;`)(resolve);
  assert.equal(registered.length, 1, "the bundle registers exactly one factory");
  return { face: registered[0].factory(resolve), runtime };
}

/**
 * Apply the face against a minimal client context and capture the card.
 *
 * The plugin offers its card in three seats (the rc line's
 * `settings.plugin.item`, the alpha line's `plugins.item` page contribution and
 * its per-package `plugins.bundle.config`). The card itself is the component
 * registered in the rc seat; the alpha page seat wraps it, so this picks by
 * seat name rather than by registration order.
 * @param {object} face - the loaded plugin face.
 * @param {object} scope - the settings scope to bind.
 * @returns {object} the registered card component.
 */
function applyAndRegister(face, scope) {
  const seats = {};
  face.apply({
    effect(cb) {
      cb();
      return () => {};
    },
    get() {
      return undefined;
    },
    slots: {
      inject(_name, callback) {
        callback();
      },
      register(options, component) {
        seats[options.name] = { options, component };
        return () => {};
      },
    },
    locale: { register: () => () => {} },
    settingsScope: { bind: () => scope },
  });
  return seats["settings.plugin.item"] ?? seats["plugins.item"] ?? null;
}

/**
 * A settings scope mirroring the client contract.
 */
function createScope(initial = {}) {
  const listeners = new Set();
  let snapshot = {
    status: "ready",
    value: initial.value ?? {},
    base: {},
    user: initial.user ?? {},
    revision: 1,
    writable: initial.writable !== false,
    mode: "host",
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // The card sends one BATCH per turn and releases the next when the previous
    // one settles, so a scope that answers synchronously keeps the walk-based
    // checks (which drive many controls in one tick) meaningful; a batch sent in
    // one turn arrives in the next microtask. The promise shapes — a refusal, a
    // rejection — have their own scopes below. A scope WITHOUT `mutate` is also
    // the older host line's shape: the card must still write field by field there.
    set(field, value) {
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value, [field]: value },
        user: { ...snapshot.user, [field]: value },
        revision: snapshot.revision + 1,
      };
      for (const listener of listeners) listener();
      return true;
    },
    unset(field) {
      const value = { ...snapshot.value };
      const user = { ...snapshot.user };
      delete value[field];
      delete user[field];
      snapshot = { ...snapshot, value, user, revision: snapshot.revision + 1 };
      for (const listener of listeners) listener();
      return true;
    },
  };
}

/**
 * Walk one element tree, collecting text, class names and tags. Component
 * functions are rendered through the same hook runtime the card used.
 */
function walk(node, runtime, out) {
  out = out ?? { text: [], classes: [], tags: [], props: [] };
  if (node === null || node === undefined || node === false || node === true) return out;
  if (typeof node === "string" || typeof node === "number") {
    out.text.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, runtime, out);
    return out;
  }
  if (typeof node !== "object" || node.type === undefined) return out;
  if (typeof node.type === "function") {
    if (node.props) {
      (out.props ?? (out.props = [])).push({ tag: node.type.name || "component", props: node.props });
    }
    runtime.rewind();
    walk(node.type(node.props ?? {}), runtime, out);
    return out;
  }
  if (typeof node.type === "string") {
    out.tags.push(node.type);
    if (node.props && node.props.className) out.classes.push(node.props.className);
    if (node.props) (out.props ?? (out.props = [])).push({ tag: node.type, props: node.props });
  }
  walk(node.children, runtime, out);
  return out;
}

/**
 * Render the card once (optionally forced open) and walk the tree.
 */
async function renderCard(scope, { open, closed } = {}) {
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  assert.ok(card, "the card must register");
  runtime.rewind();
  if (open) runtime.seed(0, true); // slot 0 = the card's `open` state
  if (closed) runtime.seed(0, false); // ...forced shut, for the collapsed case
  const out = { text: [], classes: [], tags: [] };
  walk(card.component({ scope, t: (key) => key }), runtime, out);
  return out;
}

const loadedFaceCache = {};
async function faceOnce() {
  if (loadedFaceCache.face === undefined) {
    const { face } = await loadFace();
    loadedFaceCache.face = face;
  }
  return loadedFaceCache.face;
}

/**
 * Invoke one handler and record what happened. Handlers are invoked the way
 * the DOM would: a component's own callback for the controls the card builds on
 * top of the shell primitives, and `onClick` for its own buttons.
 * @param {string} name - a readable handler name for the report.
 * @param {Function} handler - the callback to exercise.
 * @param {unknown} argument - the payload that control passes.
 * @param {{errors: string[], ran: number}} log - the collector.
 */
function fire(name, handler, argument, log) {
  try {
    handler(argument);
    log.ran += 1;
  } catch (error) {
    log.errors.push(`${name}: ${error && error.message ? error.message : String(error)}`);
  }
}

/**
 * Wait for the card's write window to close.
 *
 * The card waits {@link WRITE_QUIET_MS} for the user to stop and then sends
 * everything one turn produced as ONE patch, so nothing reaches the scope until
 * that window has passed. Waiting is all this does — no check is relaxed for it.
 * @returns {Promise<void>} resolution after the window and its timer have run.
 */
const writeWindow = () => new Promise((resolve) => setTimeout(resolve, 420));

/**
 * Exercise every handler a rendered card exposes: this is the class of check
 * that catches a control whose callback was never wired up (a typo'd binding
 * throws only when someone actually clicks it).
 * @param {object} options - sections to expand and an optional scope factory.
 * @returns {Promise<{errors: string[], ran: number, written: object}>}
 */
async function fireEveryHandler(options) {
  const log = { errors: [], ran: 0 };
  const written = {};
  const sections = options.sections ?? ["dialog", "ui", "code", null];
  for (const section of sections) {
    const scope = options.createScope();
    const { face, runtime } = await loadFace();
    const card = applyAndRegister(face, scope);
    runtime.rewind();
    runtime.seed(0, true); // card open
    runtime.seed(2, section); // which section is expanded
    const out = { text: [], classes: [], tags: [], props: [] };
    walk(card.component({ scope, t: (key) => key }), runtime, out);
    // The card waits out a short quiet window and then writes everything one turn
    // produced as ONE patch, so a check that reads what a control wrote has to let
    // that window close first — the assertions themselves are unchanged.
    const flushTurn = () => writeWindow();
    for (const entry of out.props) {
      const props = entry.props;
      const where = `${String(section)}/${entry.tag}/${props.label ?? props.labelKey ?? ""}`;
      if (entry.tag === "NumberSlider" && typeof props.onChange === "function") {
        fire(`${where}.onChange(min)`, props.onChange, props.min, log);
        fire(`${where}.onChange(max)`, props.onChange, props.max, log);
      } else if (entry.tag === "Segmented" && typeof props.onChange === "function") {
        for (const option of props.options ?? []) {
          fire(`${where}.onChange(${option.value})`, props.onChange, option.value, log);
        }
      } else if (entry.tag === "StackPicker") {
        // The CJK slot is the one that broke in 0.2.1: it wrote through an
        // undefined binding, so a click threw and the pick was lost.
        if (typeof props.onPick === "function") {
          fire(`${where}.onPick`, props.onPick, "Microsoft YaHei", log);
          await flushTurn();
          written[String(props.label)] = scope.getSnapshot().value;
        }
        if (typeof props.onRemove === "function") {
          fire(`${where}.onRemove`, props.onRemove, "Microsoft YaHei", log);
        }
      } else if (entry.tag === "PresetSelect" && typeof props.onPick === "function") {
        // The select hands the whole preset entry to its callback.
        const presets = props.presets ?? [];
        if (presets.length > 0) fire(`${where}.onPick`, props.onPick, presets[0], log);
      } else if (typeof props.onChange === "function") {
        // Text inputs and textareas take a DOM event.
        fire(`${where}.onChange(event)`, props.onChange, { target: { value: "" } }, log);
      }
      if (entry.tag === "button" && typeof props.onClick === "function") {
        fire(`${where}.onClick`, props.onClick, {
          preventDefault() {},
          stopPropagation() {},
          currentTarget: { getBoundingClientRect: () => ({}) },
        }, log);
      }
    }
  }
  return { ...log, written };
}

await test("every control's handler runs: picking the CJK slot is not a crash", async () => {
  // No localStorage in this harness, so the card renders in SIMPLE mode: the
  // family axes are the two single-pick slots, which is exactly where the
  // undefined-binding bug lived. Every section gets a fresh scope, because
  // firing the preset select legitimately resets the whole configuration.
  const result = await fireEveryHandler({
    createScope: () =>
      createScope({
        value: {
          sans: "",
          stackDialog: "",
          mono: "",
          uiFollowsDialog: false,
          sizeOffsetDialog: 1,
        },
      }),
  });
  assert.deepEqual(result.errors, [], result.errors.join(" | "));
  assert.ok(result.ran > 25, `expected a broad sweep, ran ${result.ran} handlers`);
  // The east slot must have *written*, not merely not-thrown.
  const fieldByLabel = {
    "sansEast.label": "sans",
    "dialogEast.label": "stackDialog",
    "monoEast.label": "mono",
  };
  for (const [label, field] of Object.entries(fieldByLabel)) {
    assert.ok(label in result.written, `${label} picker rendered`);
    const stack = String(result.written[label][field] ?? "");
    assert.ok(stack.toLowerCase().includes("yahei"), `${label} wrote ${field}, saw "${stack}"`);
  }
});

await test("every control's handler runs with values already configured", async () => {
  const result = await fireEveryHandler({
    createScope: () =>
      createScope({
        value: {
          sans: '"Noto Serif SC"',
          stackDialog: '"Noto Serif SC"',
          mono: '"Cascadia Code"',
          sizeOffsetDialog: 1,
          weightDialog: 480,
          weightCode: 450,
          lineHeightDialog: 120,
          noSyntheticBold: true,
          codeLigatures: 2,
          presets: JSON.stringify([{ name: "one", values: { sans: '"Inter"' }, savedAt: 1 }]),
          activePreset: "one",
        },
        user: { sans: '"Noto Serif SC"', weightDialog: 480 },
      }),
  });
  assert.deepEqual(result.errors, [], result.errors.join(" | "));
});

await test("a card in a seat that hands it no props starts open", async () => {
  // The official plugin page (0.1.7) and the rc line's configuration cell both
  // render the card as the body of a section the reader already opened, so the
  // card must NOT ask for a second click: no seed, no props, body present.
  const out = await renderCard(createScope());
  assert.ok(out.classes.some((c) => c.includes("dfp-card")), "the card element renders");
  assert.ok(out.text.includes("card.title"), "the title copy renders");
  assert.ok(out.text.includes("section.ui"), "the body is open without a click");
});

await test("a card told to stay collapsed renders the header only", async () => {
  const out = await renderCard(createScope(), { closed: true });
  assert.ok(out.classes.some((c) => c.includes("dfp-card")), "the card element renders");
  assert.ok(out.text.includes("card.title"), "the title copy renders");
  assert.equal(out.text.includes("preview.label"), false, "the body stays closed");
});

await test("an open card shows three sections, the preset bar and the flat fine-tuning block", async () => {
  const out = await renderCard(createScope(), { open: true });
  const text = out.text.join("\n");
  for (const key of ["section.ui", "section.dialog", "section.code"]) {
    assert.ok(text.includes(key), `section present: ${key}`);
  }
  // The conversation comes first: it owns every axis and the interface follows.
  assert.ok(
    text.indexOf("section.dialog") < text.indexOf("section.ui"),
    "the conversation section precedes the interface section"
  );
  assert.equal(text.includes("section.fine"), false, "fine-tuning is no longer an accordion");
  // The fine-tuning switch (simple mode is one switch) renders unconditionally
  // below the three sections.
  assert.ok(text.includes("synth.simple"), "the fine-tuning switch renders flat");
  // Summaries, not bodies: the interface controls stay hidden until expanded.
  assert.ok(text.includes("ui.follow"), "the interface summary names the follow state");
  assert.ok(text.includes("dialog.default"), "the conversation summary names DSH's defaults");
  // The preset bar lives under the edit mode, collapsed or not.
  assert.ok(text.includes("preset.label"), "the preset bar renders");
  assert.ok(text.includes("preset.rename"), "the rename control renders");
  assert.ok(text.includes("preset.import"), "the import control renders");
  assert.ok(text.includes("preset.export"), "the export control renders");
  assert.ok(text.includes("默认配置1"), "the first built-in preset is selected by default");
  assert.equal(text.includes("preview.label"), false, "the fixed preview is gone");
  assert.ok(!out.classes.includes("dfp-previewBox"), "no always-visible preview box");
  // Every on/off row is a joined segmented control; the pill switch is gone.
  assert.equal(out.classes.some((c) => c.includes("dfp-switch")), false, "no pill switches");
});

await test("an open card with a fully configured setup renders (light and dark share one set)", async () => {
  const scope = createScope({
    value: {
      sans: "Inter",
      stackDialog: "Noto Serif SC",
      mono: "JetBrains Mono",
      sizeOffset: 2,
      sizeOffsetDialog: 1,
      weight: 500,
      weightDialog: 460,
      lineHeight: 130,
      lineHeightDialog: 120,
      codeLigatures: 2,
      codeFeatures: '"ss01" on',
      noSyntheticItalic: true,
      noSyntheticBold: true,
      perTheme: true,
      darkValues: JSON.stringify({ weight: 540, lineHeight: 115 }),
      presets: JSON.stringify([{ name: "阅读", values: {}, savedAt: 1 }]),
    },
    user: { sans: "Inter", perTheme: true },
  });
  const out = await renderCard(scope, { open: true });
  const text = out.text.join("\n");
  assert.ok(out.classes.some((c) => c.includes("dfp-cardOpen")), "the card is open");
  // The per-theme editor ships in a later release: no switcher, no editor.
  assert.equal(text.includes("theme.edit"), false, "no theme editor row");
  assert.equal(text.includes("theme.label"), false, "no per-theme switch row");
  // The conversation owns every axis, so its summary lists its own values.
  assert.ok(text.includes("Noto Serif SC"), "the conversation summary lists its family");
  assert.ok(text.includes("ui.follow"), "the interface summary names the follow state");
  assert.ok(/presets|·/.test(text), "the collapsed sections render their summaries");
  // Nothing in the tree may be the literal string "undefined".
  assert.equal(text.includes("undefined"), false, "no undefined leaks into the copy");
});

await test("a read-only deployment renders the note and keeps controls disabled", async () => {
  const scope = createScope({ writable: false });
  const out = await renderCard(scope, { open: true });
  const text = out.text.join("\n");
  assert.ok(text.includes("card.readOnly"), "the read-only note renders");
});

await test("the zh copy covers the same keys as en (structure, not text)", async () => {
  // The dictionaries are checked in run.mjs; here we only prove the card can
  // render with a zh-style translator returning short strings.
  const scope = createScope();
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  const out = { text: [], classes: [], tags: [] };
  walk(card.component({ scope, t: (key) => key.slice(0, 4) }), runtime, out);
  assert.ok(out.classes.some((c) => c.includes("dfp-card")), "renders with arbitrary copy");
});

await test("an expanded presets-free card: renaming state keeps the bar on one row", async () => {
  const scope = createScope();
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  runtime.seed(0, true); // card open
  const out = { text: [], classes: [], tags: [] };
  walk(card.component({ scope, t: (key) => key }), runtime, out);
  const text = out.text.join("\n");
  assert.ok(text.includes("preset.autoSave"), "the auto-save hint renders under the bar");
  assert.ok(out.classes.includes("dfp-presetBar"), "the bar is one flex row");
  assert.ok(!text.includes("section.presets"), "presets are no longer an accordion section");
});

await test("an expanded interface section leads with the follow row while following", async () => {
  const scope = createScope();
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  runtime.seed(0, true); // card open
  runtime.seed(2, "ui"); // expanded section id
  const out = { text: [], classes: [], tags: [] };
  walk(card.component({ scope, t: (key) => key }), runtime, out);
  const text = out.text.join("\n");
  assert.ok(text.includes("ui.follow"), "the follow row renders");
  assert.ok(text.includes("common.on"), "the On option renders");
  assert.ok(text.includes("common.off"), "the Off option renders");
  // While following, the two axes it would own come from the conversation, so
  // their controls stay hidden.
  assert.equal(text.includes("sans.label"), false, "no interface family field while following");
  assert.equal(text.includes("weight.uiLabel"), false, "no interface weight slider while following");
  assert.ok(text.includes("preview.sansCaption"), "the interface preview stays available");
  assert.ok(out.classes.includes("dfp-previewBox"), "an inline preview box renders");
  // The retired interface size and line-height axes must not come back.
  assert.equal(text.includes("size.bodyLabel"), false, "no interface size slider");
  assert.equal(text.includes("line.bodyLabel"), false, "no interface line-height slider");
});

await test("with the follow row off, the interface's own controls appear", async () => {
  const scope = createScope({ value: { uiFollowsDialog: false } });
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  runtime.seed(0, true); // card open
  runtime.seed(2, "ui"); // expanded section id
  const out = { text: [], classes: [], tags: [] };
  walk(card.component({ scope, t: (key) => key }), runtime, out);
  const text = out.text.join("\n");
  assert.ok(text.includes("sans.label"), "the interface family field renders");
  assert.ok(text.includes("weight.uiLabel"), "the interface weight slider renders");
  assert.ok(text.includes("preview.sansCaption"), "the interface preview renders");
  assert.equal(text.includes("preview.dialogCaption"), false, "the conversation preview stays closed");
  assert.equal(text.includes("preview.monoCaption"), false, "the code preview stays closed");
  // The follow row says what it covers; the copy check for "follows the
  // interface" lives in run.mjs, where the dictionaries are readable.
  assert.ok(text.includes("ui.followHint"), "the follow row carries its scope hint");
});

await test("switching the follow switch off carries the values it was showing", async () => {
  // The page is showing the conversation's family and weight through the
  // interface; turning the switch off must not change that, and the interface's
  // own fields must start from those values.
  const scope = createScope({
    value: {
      stackDialog: "Inter",
      weightDialog: 80,
      uiFollowsDialog: true,
    },
  });
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  runtime.seed(0, true); // card open
  runtime.seed(2, "ui"); // expanded section id
  const out = { text: [], classes: [], tags: [], props: [] };
  walk(card.component({ scope, t: (key) => key }), runtime, out);
  const follow = out.props.find((entry) => entry.props.label === "ui.follow");
  assert.ok(follow, "the follow control renders");
  assert.equal(follow.props.value, "on");
  follow.props.onChange("off");
  await writeWindow();
  const written = scope.getSnapshot().value;
  assert.equal(written.uiFollowsDialog, false, "the switch is off");
  assert.equal(written.sans, "Inter", "the family it was showing becomes its own");
  assert.equal(written.weight, 80, "the weight offset it was showing becomes its own");
});

await test("an unset follow target leaves the interface on DSH's own values", async () => {
  // Nothing in the conversation sets either axis, so switching off must clear
  // the interface's own fields rather than pin them to a neutral number.
  const scope = createScope({
    value: { stackDialog: "", weightDialog: 0, uiFollowsDialog: true, sans: "", weight: 0 },
  });
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  runtime.seed(0, true);
  runtime.seed(2, "ui");
  const out = { text: [], classes: [], tags: [], props: [] };
  walk(card.component({ scope, t: (key) => key }), runtime, out);
  out.props.find((entry) => entry.props.label === "ui.follow").props.onChange("off");
  await writeWindow();
  const snapshot = scope.getSnapshot();
  assert.equal(snapshot.value.uiFollowsDialog, false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.user, "weight"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.user, "sans"), false);
});

await test("an expanded dialog section shows all four of its axes", async () => {
  const scope = createScope();
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  runtime.seed(0, true); // card open
  runtime.seed(2, "dialog"); // expanded section id
  const out = { text: [], classes: [], tags: [] };
  walk(card.component({ scope, t: (key) => key }), runtime, out);
  const text = out.text.join("\n");
  // The conversation has no follow switch: it owns every axis outright. The
  // only occurrence of the follow copy is the interface's collapsed summary.
  assert.equal(
    text.split("ui.follow").length - 1,
    1,
    "no follow row in the conversation section"
  );
  assert.ok(text.includes("dialog.label"), "the conversation family field renders");
  assert.ok(text.includes("size.dialogLabel"), "the conversation size slider renders");
  assert.ok(text.includes("line.dialogLabel"), "the conversation line-height slider renders");
  assert.ok(text.includes("weight.dialogLabel"), "the conversation weight slider renders");
  // The weight axes are OFFSETS now: an unset one reads the neutral 0 on a
  // slider that spans the offset range, never a blank state and never an
  // absolute weight.
  const dialogSlider = out.props.find(
    (entry) => entry.props && entry.props["aria-label"] === "weight.dialogLabel"
  );
  assert.ok(dialogSlider, "the conversation weight slider is an input");
  assert.equal(dialogSlider.props.value, 0, "an unset offset reads 0");
  assert.equal(dialogSlider.props.min, -100, "the lighter end of the offset range");
  assert.equal(dialogSlider.props.max, 200, "the bolder end of the offset range");
  assert.ok(dialogSlider.props.step >= 1, "the notch is the family's weight granularity");
  assert.ok(text.includes("preview.dialogCaption"), "the conversation preview renders");
  assert.equal(text.includes("preview.sansCaption"), false, "the interface preview stays closed");
});

await test("an expanded code section shows the ligature and line-height controls", async () => {
  const scope = createScope();
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  runtime.seed(0, true); // card open
  runtime.seed(2, "code"); // expanded section id
  const out = { text: [], classes: [], tags: [] };
  walk(card.component({ scope, t: (key) => key }), runtime, out);
  const text = out.text.join("\n");
  assert.ok(text.includes("mono.label"), "the code family field renders");
  assert.ok(text.includes("size.codeLabel"), "the code size slider renders");
  assert.ok(text.includes("line.codeLabel"), "the code line-height slider renders");
  assert.ok(text.includes("weight.codeLabel"), "the code weight slider renders");
  // All three weight axes share one shape: an offset centred on zero, so the
  // code slider is the same control as the conversation and interface ones.
  const codeSlider = out.props.find(
    (entry) => entry.props && entry.props["aria-label"] === "weight.codeLabel"
  );
  assert.ok(codeSlider, "the code weight slider is an input");
  assert.equal(codeSlider.props.min, -100, "the offset scale starts at -100");
  assert.equal(codeSlider.props.max, 200, "and ends at +200");
  assert.equal(codeSlider.props.value, 0, "an unset code offset reads 0");
  // The notch is the family's measured weight granularity; without a canvas the
  // measurement degrades to single units rather than breaking the card.
  assert.ok(codeSlider.props.step >= 1, "the code slider carries its step");
  assert.ok(text.includes("lig.label"), "the ligature control renders");
  assert.ok(text.includes("lig.default"), "the three ligature options render");
  assert.ok(text.includes("preview.monoCaption"), "the code preview renders");
  assert.ok(text.includes("preview.code"), "the code sample renders");
});

await test("the preset message rides the hint row and only ever fades", async () => {
  // Slot map: 0 open · 1 view · 2 expanded · 3 presetName · 4 presetStatus ·
  // 5 statusShown · 6 exportText. The message must live in an always-mounted
  // node (so nothing below it moves) and switch a CSS class (so it can fade,
  // not pop).
  const empty = await (async () => {
    const scope = createScope();
    const { face, runtime } = await loadFace();
    const card = applyAndRegister(face, scope);
    runtime.rewind();
    runtime.seed(0, true); // card open
    const out = { text: [], classes: [], tags: [] };
    walk(card.component({ scope, t: (key) => key }), runtime, out);
    return out;
  })();
  assert.ok(empty.classes.includes("dfp-presetMeta"), "the shared hint/message row renders");
  assert.equal(
    empty.classes.filter((c) => c.startsWith("dfp-status")).length,
    1,
    "the message node is mounted even with nothing to say"
  );
  assert.equal(empty.classes.includes("dfp-statusOn"), false, "and it starts transparent");

  const shown = await (async () => {
    const scope = createScope();
    const { face, runtime } = await loadFace();
    const card = applyAndRegister(face, scope);
    runtime.rewind();
    runtime.seed(0, true); // card open
    runtime.seed(4, { text: "preset.exported", id: 1 }); // the message
    runtime.seed(5, true); // shown
    const out = { text: [], classes: [], tags: [] };
    walk(card.component({ scope, t: (key) => key }), runtime, out);
    return out;
  })();
  assert.ok(shown.text.includes("preset.exported"), "the message renders");
  assert.ok(shown.text.includes("preset.autoSave"), "the auto-save hint shares the row");
  assert.ok(
    shown.classes.some((c) => c.includes("dfp-statusOn")),
    "the visible state is a class"
  );
  assert.equal(
    shown.classes.filter((c) => c.startsWith("dfp-status")).length,
    1,
    "still exactly one node — it fades, it is not re-created"
  );
});

/**
 * Render an open card with one section expanded and return the walk plus the
 * runtime (whose `sets` records every state the card tried to write).
 * @param {object} scope - the settings scope.
 * @param {string|null} section - the expanded accordion id.
 * @returns {Promise<{out: object, runtime: object}>} the walk result.
 */
async function renderSection(scope, section) {
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  runtime.seed(0, true); // card open
  runtime.seed(2, section); // which section is expanded
  const out = { text: [], classes: [], tags: [], props: [] };
  walk(card.component({ scope, t: (key) => key }), runtime, out);
  return { out, runtime };
}

await test("a refused settings write says so instead of looking saved", async () => {
  // A write the settings document rejects used to vanish without a word: the
  // control snapped back to the stored value and the user believed it saved.
  const scope = createScope();
  scope.set = () => Promise.reject(new Error("host said no"));
  const { out, runtime } = await renderSection(scope, "dialog");
  const slider = out.props.find(
    (entry) => entry.tag === "NumberSlider" && typeof entry.props.onChange === "function"
  );
  assert.ok(slider, "the conversation size slider renders");
  slider.props.onChange(3);
  await writeWindow();
  const status = runtime.sets
    .map((entry) => entry.value)
    .find((value) => value && typeof value === "object" && "text" in value);
  assert.ok(status, `the card set a status message: ${JSON.stringify(runtime.sets)}`);
  assert.equal(status.text, "preset.writeFailed");
  assert.ok(status.id > 0, "the message carries a fresh id so the row re-fades");
});

await test("a refused write through a synchronous throw is caught too", async () => {
  const scope = createScope();
  scope.set = () => {
    throw new Error("read-only scope");
  };
  const { out, runtime } = await renderSection(scope, "ui");
  const follow = out.props.find(
    (entry) => entry.tag === "Segmented" && entry.props.label === "ui.follow"
  );
  assert.ok(follow, "the follow control renders");
  follow.props.onChange("off");
  // The batch leaves in the next microtask, and so does the throw it earns.
  await writeWindow();
  const status = runtime.sets
    .map((entry) => entry.value)
    .find((value) => value && typeof value === "object" && "text" in value);
  assert.ok(status, "the throw is reported, not swallowed");
  assert.equal(status.text, "preset.writeFailed");
});

await test("an export the clipboard refuses is handed over selected", async () => {
  // Node 22 exposes `navigator` as a getter-only global, so a plain
  // assignment fails; swap the property descriptor and put it back after.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: () => Promise.reject(new Error("not allowed")) } },
  });
  try {
    const presets = JSON.stringify([{ name: "one", values: { weight: 80 }, savedAt: 1 }]);
    const scope = createScope({ value: { presets } });
    const { out, runtime } = await renderSection(scope, null);
    const button = out.props.find(
      (entry) => entry.tag === "button" && entry.props.children === "preset.export"
    );
    assert.ok(button, "the export button renders");
    button.props.onClick();
    await writeWindow();
    const values = runtime.sets.map((entry) => entry.value);
    // The whole JSON, not a 120-character prefix of it in the status row.
    const handed = values.find((value) => typeof value === "string" && value.startsWith("["));
    assert.ok(handed, `the JSON reached the card: ${JSON.stringify(values)}`);
    assert.deepEqual(JSON.parse(handed), [{ name: "one", values: { weight: 80 }, savedAt: 1 }]);
    const status = values.find((value) => value && typeof value === "object" && "text" in value);
    assert.equal(status.text, "preset.exportManual");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
});

await test("the clipboard-less export box is read-only, selected and dismisses itself", async () => {
  const scope = createScope();
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  runtime.seed(0, true); // card open
  runtime.seed(6, '[{"name":"one"}]'); // the export text
  const out = { text: [], classes: [], tags: [], props: [] };
  walk(card.component({ scope, t: (key) => key }), runtime, out);
  const box = out.props.find((entry) => entry.tag === "textarea" && entry.props.readOnly === true);
  assert.ok(box, "the box renders");
  assert.equal(box.props.value, '[{"name":"one"}]');
  assert.ok(String(box.props.className).includes("dfp-search"), "it reuses the field surface");
  let selected = false;
  box.props.onFocus({ target: { select: () => { selected = true; } } });
  assert.equal(selected, true, "focusing selects the text, so the copy shortcut just works");
  box.props.onCopy();
  assert.ok(
    runtime.sets.some((entry) => entry.index === 6 && entry.value === ""),
    "copying puts the box away"
  );
  // With nothing to hand over there is no box at all.
  const plain = await renderCard(createScope(), { open: true });
  assert.equal(
    plain.props.filter((entry) => entry.tag === "textarea").length,
    0,
    "no box unless an export failed"
  );
});

await test("resetting every axis clears the retired ones too", async () => {
  // The interface size and line-height axes no longer render, so a value left
  // behind would be invisible forever: "reset" has to reach them.
  const scope = createScope({
    value: { weightDialog: 480, sizeOffset: 3, lineHeight: 140 },
    user: { weightDialog: 480, sizeOffset: 3, lineHeight: 140 },
  });
  const { out } = await renderSection(scope, null);
  const reset = out.props.find(
    (entry) => entry.tag === "button" && String(entry.props.className).includes("dfp-resetAll")
  );
  assert.ok(reset, "the reset-everything button renders");
  reset.props.onClick();
  await writeWindow();
  const user = scope.getSnapshot().user;
  for (const field of ["weightDialog", "sizeOffset", "lineHeight"]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(user, field),
      false,
      `${field} must be cleared`
    );
  }
  // The auto-save contract writes the preset snapshot back; that is expected
  // and is not an axis.
  assert.ok(typeof user.presets === "string", "the active preset snapshot follows the reset");
});

/**
 * Walk the children a component already returned.
 *
 * `walk` renders a component again on its way down, which resets the hook
 * store; when a check needs the tree the component just produced with a
 * specific state in place, this walks what it returned instead of re-running
 * it.
 * @param {object} tree - the element tree the component returned.
 * @param {object} runtime - the hooks runtime to render children with.
 * @returns {object} the walk result.
 */
function walkChildrenOf(tree, runtime) {
  const out = { text: [], classes: [], tags: [], props: [] };
  walk(tree.children, runtime, out);
  return out;
}

await test("a second render after a state change keeps the hook order", async () => {
  // React renders the component again whenever a handler sets state, and the
  // 0.1.0 release shipped a card that crashed on exactly that second render
  // (a hook count that differed between the two). This walks the card, applies
  // every state the first pass set, and walks it again.
  const scope = createScope({
    value: {
      stackDialog: '"Noto Serif SC"',
      mono: '"Cascadia Code"',
      weightDialog: 480,
    },
  });
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  const walkOnce = (seeds) => {
    runtime.rewind();
    runtime.seed(0, true); // card open
    runtime.seed(2, "dialog"); // the conversation section expanded
    for (const [index, value] of seeds ?? []) runtime.seed(index, value);
    // The card's own hooks are recorded by this call; the nested components
    // that `walk` renders below rewind the slot store, so read the count now.
    const tree = card.component({ scope, t: (key) => key });
    const hooks = runtime.hooksUsed();
    return { out: walkChildrenOf(tree, runtime), hooks };
  };
  const first = walkOnce();
  assert.ok(first.hooks > 10, `the card uses a real hook list, saw ${first.hooks}`);
  // Switch the edit mode: that is a state change inside the card.
  const mode = first.out.props.find(
    (entry) => entry.tag === "Segmented" && String(entry.props.label).startsWith("mode.")
  );
  assert.ok(mode, "the edit-mode control renders");
  mode.props.onChange("advanced");
  const seeds = runtime.sets.map((entry) => [entry.index, entry.value]);
  assert.ok(seeds.length > 0, "the mode switch set state");
  const second = walkOnce(seeds);
  assert.equal(
    second.hooks,
    first.hooks,
    "the same hooks run in the same order on the second render"
  );
  // The second render really is the advanced card: its family field is the
  // multi-entry chip stack, which the simple mode never renders.
  assert.ok(
    second.out.classes.includes("dfp-chips"),
    "the advanced chip stack rendered after the state change"
  );
  assert.equal(first.out.classes.includes("dfp-chips"), false, "the first render was simple mode");
});

await test("a boolean refusal from the alpha dialect is reported too", async () => {
  // The alpha's form controller answers a write with a plain boolean (the rc
  // scope answers with a promise), so a refusal has to be recognised in both
  // shapes.
  const scope = createScope();
  scope.set = () => false;
  scope.unset = () => false;
  const { out, runtime } = await renderSection(scope, "dialog");
  const slider = out.props.find(
    (entry) => entry.tag === "NumberSlider" && typeof entry.props.onChange === "function"
  );
  assert.ok(slider, "the conversation size slider renders");
  slider.props.onChange(3);
  // The batch leaves in the next microtask, and so does the refusal it earns.
  await writeWindow();
  const status = runtime.sets
    .map((entry) => entry.value)
    .find((value) => value && typeof value === "object" && "text" in value);
  assert.ok(status, "a refusal is reported, not swallowed");
  assert.equal(status.text, "preset.writeFailed");
});

await test("one turn's axis value and its preset snapshot travel in ONE call", async () => {
  // Two calls would be two whole-document rewrites on the host (measured 1.0-5.1 s
  // each, one document write each), and the user's click only needs one. The form
  // face exposes `mutate(ops)` for exactly this.
  const calls = [];
  const scope = createScope({
    value: {
      presets: JSON.stringify([{ name: "one", values: { sizeOffsetDialog: 1 }, savedAt: 1 }]),
      activePreset: "one",
    },
  });
  scope.mutate = (ops) => {
    calls.push(ops);
    for (const op of ops) {
      if (op.op === "unset") scope.unset(op.path[0]);
      else scope.set(op.path[0], op.value);
    }
    return true;
  };
  const { out } = await renderSection(scope, "dialog");
  const slider = out.props.find(
    (entry) => entry.tag === "NumberSlider" && typeof entry.props.onChange === "function"
  );
  slider.props.onChange(3);
  await writeWindow();
  assert.equal(calls.length, 1, `expected one batched call, saw ${calls.length}`);
  const paths = calls[0].map((op) => op.path[0]).sort();
  assert.deepEqual(paths, ["presets", "sizeOffsetDialog"], `batch carried ${paths.join(", ")}`);
  const stored = JSON.parse(scope.getSnapshot().value.presets);
  assert.equal(stored[0].values.sizeOffsetDialog, 3, "the snapshot mirrors the value that landed");
});

await test("a preset snapshot is not rewritten when nothing in it moved", async () => {
  // `savedAt` is a timestamp, so writing unconditionally made every re-pick of the
  // value a preset already held a whole-document rewrite on the host.
  const calls = [];
  const scope = createScope({
    value: {
      presets: JSON.stringify([{ name: "one", values: { sizeOffsetDialog: 3 }, savedAt: 1 }]),
      activePreset: "one",
    },
  });
  scope.mutate = (ops) => {
    calls.push(ops);
    for (const op of ops) {
      if (op.op === "unset") scope.unset(op.path[0]);
      else scope.set(op.path[0], op.value);
    }
    return true;
  };
  const { out } = await renderSection(scope, "dialog");
  const slider = out.props.find(
    (entry) => entry.tag === "NumberSlider" && typeof entry.props.onChange === "function"
  );
  // The slider's own value is already 3, so this writes the value the preset holds.
  slider.props.onChange(3);
  await writeWindow();
  assert.equal(calls.length, 1, `expected one call, saw ${calls.length}`);
  assert.deepEqual(
    calls[0].map((op) => op.path[0]),
    ["sizeOffsetDialog"],
    "no snapshot op for a value the snapshot already has"
  );
  assert.equal(JSON.parse(scope.getSnapshot().value.presets)[0].savedAt, 1, "savedAt untouched");
});

await test("a burst of picks leaves ONE write holding the last value", async () => {
  // The host answers a settings call in 1.0-5.1 s, so a queue of stale values is
  // seconds of work for values nobody wants any more.
  const calls = [];
  const scope = createScope({
    value: {
      presets: JSON.stringify([{ name: "one", values: {}, savedAt: 1 }]),
      activePreset: "one",
    },
  });
  let release = null;
  scope.mutate = (ops) => {
    calls.push(ops);
    if (calls.length === 1) return new Promise((resolve) => { release = resolve; });
    for (const op of ops) scope.set(op.path[0], op.value);
    return true;
  };
  const { out } = await renderSection(scope, "dialog");
  const slider = out.props.find(
    (entry) => entry.tag === "NumberSlider" && typeof entry.props.onChange === "function"
  );
  // Four picks with no pause between them: the user has not stopped yet, so nothing
  // may go out — the document would take on the first value and every one after it,
  // and each of those states comes back to the page as a jump.
  slider.props.onChange(1);
  slider.props.onChange(2);
  slider.props.onChange(3);
  slider.props.onChange(4);
  assert.equal(calls.length, 0, "nothing is written while the user is still moving");
  await writeWindow();
  assert.equal(calls.length, 1, `the run is ONE call, saw ${calls.length}`);
  const carried = calls[0].find((op) => op.path[0] === "sizeOffsetDialog");
  assert.equal(carried.value, 4, "the call carries the value the user stopped on");
  // A pick that arrives while that call is in flight waits for it, then goes out as
  // its own call: one call in flight at a time, and no value is dropped.
  slider.props.onChange(5);
  await writeWindow();
  assert.equal(calls.length, 1, "nothing else goes out while a call is in flight");
  release(true);
  await writeWindow();
  assert.equal(calls.length, 2, `the late pick is one more call, saw ${calls.length}`);
  assert.equal(
    calls[1].find((op) => op.path[0] === "sizeOffsetDialog").value,
    5,
    "the late pick kept its own value"
  );
});

await test("two picks with a pause between them are two writes", async () => {
  // The window tracks "the user stopped", not "a second has passed": a pick made
  // after the window closed is a separate change and has to reach the document on
  // its own, or the last value of a slow edit would never be stored.
  const calls = [];
  const scope = createScope({ value: { presets: JSON.stringify([]), activePreset: "one" } });
  scope.mutate = (ops) => {
    calls.push(ops);
    for (const op of ops) scope.set(op.path[0], op.value);
    return true;
  };
  const { out } = await renderSection(scope, "dialog");
  const slider = out.props.find(
    (entry) => entry.tag === "NumberSlider" && typeof entry.props.onChange === "function"
  );
  slider.props.onChange(1);
  await writeWindow();
  slider.props.onChange(2);
  await writeWindow();
  assert.equal(calls.length, 2, `two separate picks are two calls, saw ${calls.length}`);
});

await test("a refused write hands the control its refusal, not a clock", async () => {
  // The value goes back to the document's because the HOST SAID NO — not because a
  // timer guessed that a slow-but-healthy write had failed. Two halves: every
  // slider is wired to the refusal signal, and a refusal lands in the card's state
  // under the field it belonged to.
  const scope = createScope();
  scope.set = () => false;
  scope.unset = () => false;
  const { out, runtime } = await renderSection(scope, "dialog");
  const sliders = out.props.filter(
    (entry) => entry.tag === "NumberSlider" && typeof entry.props.onChange === "function"
  );
  assert.ok(sliders.length > 0, "the conversation sliders render");
  for (const slider of sliders) {
    assert.equal(typeof slider.props.refusedToken, "number", "every slider takes a refusal token");
  }
  sliders[0].props.onChange(3);
  await writeWindow();
  // The refusal is a functional state update, which is how it can count from
  // whatever the previous refusal left behind.
  const updater = runtime.sets
    .map((entry) => entry.value)
    .find((value) => typeof value === "function");
  assert.ok(updater, `the refusal reached the card's state: ${JSON.stringify(runtime.sets)}`);
  const next = updater({ sizeOffsetDialog: 4 });
  assert.equal(next.sizeOffsetDialog, 5, `the token counts up: ${JSON.stringify(next)}`);
});

await test("the card renders in a seat that hands it no props", async () => {
  // The alpha's bundle page renders the registered component with its own
  // props, so the scope and translator `apply` bound have to carry it.
  const scope = createScope({ value: { stackDialog: '"Inter"', weightDialog: 480 } });
  const { face, runtime } = await loadFace();
  const card = applyAndRegister(face, scope);
  runtime.rewind();
  runtime.seed(0, true); // card open
  runtime.seed(2, "dialog");
  const out = { text: [], classes: [], tags: [], props: [] };
  walk(card.component({}), runtime, out);
  const text = out.text.join("\n");
  assert.ok(
    out.classes.some((name) => name.includes("dfp-card")),
    `the card renders with no injected face (saw ${out.classes.slice(0, 6).join(" | ")})`
  );
  // The built-in dictionary answers, not the bare keys: the fallback translator
  // is the real one, only its locale is defaulted.
  assert.ok(text.includes("Font tune"), "the fallback translator resolves the dictionary");
  assert.equal(text.includes("undefined"), false, "no undefined leaks into the copy");
  assert.ok(text.includes("Conversation font"), "the controls render from the bound scope");
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
